# Notification destination testing · 2026-10-18

User request (verbatim):

> Jó, nekem jónak tűnik first glance, meg az implementációt is nézegettem.
>
> Van ötleted hogy próbáljuk ki a noti destinationöket? Nincs slackem és én most ezért nem akarok bloatot a gépemre, meg regisztrálni meg az egész szemeten végigesni. Ha nincs más út, persze, legyen. De elkerülném, ha lehet :D
>
> E-Mailt gondolom tudod tesztelni. Mehet a gmailemre, arra simán rálátsz.
>
> Lastly: nyilván az értesítési tesztet nem tudjuk igazi alerttel tesztelni mert ahhoz igazi esemény is kéne, fogalmam sincs mire iratkozzunk fel ehhez. Ha én tévedek és te tudsz valamit amivel mégis cross cutting tesztelhető, csináljad. Ha nem, akkor meg a kreativitásodra bízom. Akár egy dummy RSS is lehet, whatever, ami hatékony és hamar megy.

The user authorizes notification tests to their own connected Gmail inbox.
Prefer a controlled RSS source and local Slack protocol receiver over new
accounts, installed clients or paid services. Record separately the
application pipeline, a simulated provider, and actual external receipt.
