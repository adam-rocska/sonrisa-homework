import { initTRPC, TRPCError } from "@trpc/server";
import { adminOverviewDto, adminRetryInput, catalogDto, catalogReplaceInput, deliveryDto, destinationDto, destinationSaveInput, feedConfigureInput, feedDto, idInput, userDto } from "@signalpost/contracts";
import { DomainError, type CatalogStore } from "@signalpost/core";
import { z } from "zod";
import type { Principal } from "./identity.js";
import { catalogToDto, deliveryToDto, destinationToDto, feedToDto, overviewToDto } from "./mappers.js";

export type ApplicationStore = Pick<CatalogStore,
  "getCatalog" | "replaceCatalog" | "configureFeed" | "listDestinations" |
  "createDestination" | "updateDestination" | "removeDestination" |
  "listDeliveries" | "adminOverview" | "retryDelivery"
>;

export interface RpcContext {
  readonly principal: Principal | null;
  readonly store: ApplicationStore;
}

const t = initTRPC.context<RpcContext>().create({
  errorFormatter({ shape, error }) {
    return error.code === "INTERNAL_SERVER_ERROR" ? { ...shape, message: "The server could not complete this operation.", data: { ...shape.data, stack: undefined } } : { ...shape, data: { ...shape.data, stack: undefined } };
  },
});

const authenticated = t.procedure.use(({ ctx, next }) => {
  if (ctx.principal === null) throw new TRPCError({ code: "UNAUTHORIZED", message: "Sign in to Signalpost with Google first." });
  return next({ ctx: { ...ctx, principal: ctx.principal } });
});

const administrator = authenticated.use(({ ctx, next }) => {
  if (ctx.principal.role !== "admin") throw new TRPCError({ code: "FORBIDDEN", message: "An administrator account is required." });
  return next({ ctx });
});

function domain<T>(operation: () => T): T {
  try { return operation(); } catch (error) {
    if (error instanceof DomainError) {
      const code = error.code === "NOT_FOUND" ? "NOT_FOUND" : error.code === "VALIDATION" ? "BAD_REQUEST" : "CONFLICT";
      throw new TRPCError({ code, message: error.message, cause: error });
    }
    throw error;
  }
}

export const appRouter = t.router({
  me: t.procedure.output(userDto.nullable()).query(({ ctx }) => ctx.principal),
  catalog: t.router({
    get: authenticated.output(catalogDto).query(({ ctx }) => domain(() => catalogToDto(ctx.store.getCatalog(ctx.principal.id)))),
    replace: authenticated.input(catalogReplaceInput).output(catalogDto).mutation(({ ctx, input }) => domain(() => {
      const feeds = input.feeds.map((feed) => ({ url: feed.feedUrl, query: feed.query }));
      return catalogToDto(ctx.store.replaceCatalog(ctx.principal.id, input.sourceId, feeds));
    })),
  }),
  feed: t.router({
    configure: authenticated.input(feedConfigureInput).output(feedDto).mutation(({ ctx, input }) => domain(() => feedToDto(ctx.store.configureFeed(ctx.principal.id, input.feedId, {
      ...(input.enabled === undefined ? {} : { enabled: input.enabled }),
      ...(input.destinationIds === undefined ? {} : { destinationIds: input.destinationIds }),
    })))),
  }),
  destination: t.router({
    list: authenticated.output(z.array(destinationDto)).query(({ ctx }) => domain(() => ctx.store.listDestinations(ctx.principal.id).map(destinationToDto))),
    save: authenticated.input(destinationSaveInput).output(destinationDto).mutation(({ ctx, input }) => domain(() => {
      if (input.id !== undefined) {
        const existing = ctx.store.listDestinations(ctx.principal.id).find((destination) => destination.id === input.id);
        if (existing === undefined) throw new TRPCError({ code: "NOT_FOUND", message: "Destination not found." });
        if (existing.kind !== input.kind) throw new TRPCError({ code: "BAD_REQUEST", message: "Create a new destination to change its delivery channel." });
        return destinationToDto(ctx.store.updateDestination(ctx.principal.id, input.id, {
          label: input.label,
          enabled: input.enabled,
          ...(input.target === undefined || input.target === "" ? {} : { target: input.target }),
        }));
      }
      if (input.target === undefined || input.target === "") throw new TRPCError({ code: "BAD_REQUEST", message: "A target is required for a new destination." });
      const created = ctx.store.createDestination(ctx.principal.id, { kind: input.kind, label: input.label, target: input.target });
      return destinationToDto(input.enabled ? created : ctx.store.updateDestination(ctx.principal.id, created.id, { enabled: false }));
    })),
    remove: authenticated.input(idInput).output(z.object({ removed: z.literal(true) })).mutation(({ ctx, input }) => domain(() => {
      ctx.store.removeDestination(ctx.principal.id, input.id);
      return { removed: true as const };
    })),
  }),
  delivery: t.router({
    list: authenticated.output(z.array(deliveryDto)).query(({ ctx }) => domain(() => ctx.store.listDeliveries(ctx.principal.id, 100).map(deliveryToDto))),
  }),
  admin: t.router({
    overview: administrator.output(adminOverviewDto).query(({ ctx }) => domain(() => overviewToDto(ctx.store.adminOverview()))),
    retry: administrator.input(adminRetryInput).output(deliveryDto).mutation(({ ctx, input }) => domain(() => deliveryToDto(ctx.store.retryDelivery(input.deliveryId)))),
  }),
});

export type AppRouter = typeof appRouter;
