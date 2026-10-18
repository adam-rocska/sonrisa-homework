# Deployment portability · 2026-10-18

User request (verbatim):

> Jó. Akkor még dolgozz rajta, hogy jól polírozott legyen. Ami még eszembe jutott, hogy lehetne egy pulumit rakni köré. És akkor a potenciális üzemelési környezeten pattogást is kizártuk.
>
> Jól emlékszem, nem? Pulumival szoktuk intézni, hogy ne kábítson a közeg azzal, hogy docker kubernetes / aws azure gcc / whatever vagy bármi más implementation detail szerint menjen.
>
> Absztraháljad ki a fenébe, ennyi a lnéyeg.

The owner authorizes implementing a deployment abstraction and further
polishing. Earlier constraints still apply: free tooling, separate models,
strict TypeScript, pnpm, SQLite and recursive FHS layout. This is not a
request to purchase or provision paid cloud resources or send the employer
email. The existing authenticated local instance remains available.
