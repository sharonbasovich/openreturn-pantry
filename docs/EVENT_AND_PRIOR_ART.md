# Qualification and scope

Checked November 8, 2026, approximately 01:05–01:11 UTC, before implementation.

## Code for Change

Official overview: https://code-for-change-global.devpost.com/
Rules: https://code-for-change-global.devpost.com/rules
Schedule: https://code-for-change-global.devpost.com/details/dates

The event is open to adult students internationally, excluding its standard country exceptions. Entrants must individually confirm their eligibility and registration. New original work must be made during the event period. The schedule opens November 5 at 05:00 UTC and closes December 2 at 01:00 UTC. The rules defer the submission deadline to that timeline. The rules' November 21 winner date conflicts with the schedule's December 5 announcement; no attempt is made to resolve that conflict here. This does not prevent work during the verified open period.

Judging includes impact, originality, technical execution, usability and clarity. Required material includes a complete project page, demo or demo video, and relevant code/instructions. The published first prize is $200; second, third and honorable mention are recognition awards. The public count changed from 32 to 33 people during the check. People are not team or submission counts.

## Problem evidence

The 2025 study “Client and Pantry Factors Influencing Transportation-Related Barriers Among Users of Food Pantries: A Cross-Sectional Analysis” investigated 430 pantry clients and discusses the interaction of client, pantry and transit schedules. It supports researching the problem, not the effectiveness of this prototype or causal promises about changing hours.
https://pmc.ncbi.nlm.nih.gov/articles/PMC12609604/

Food Banks Canada's 2024 Poverty and Food Insecurity report identifies transportation and limited hours among reported access barriers. These national survey findings are not local demand data for our synthetic stop scenarios.
https://content.foodbankscanada.ca/wordpress/2024/04/FBC_2024PAR_Report_Eng_v6.pdf

## Prior art and defensible contribution

- Conveyal Analysis already provides schedule-dependent transport accessibility, scenario comparison and itineraries: https://docs.conveyal.com/analysis
- OpenTripPlanner already supplies sophisticated multimodal routing: https://docs.opentripplanner.org/en/latest/
- GeoDS research already combines transit schedules with food-shop opening hours: https://data.geods.ac.uk/dataset/london-nighttime-access-to-food-retail-options
- Published work already proposes multi-dimensional food-access measures using travel time and operating hours: https://www.sciencedirect.com/science/article/pii/S1353829224001473

OpenReturn's intended contribution is a small, inspectable operator workflow: compare equal-duration opening windows using complete-return evidence, expose origins lost as well as gained, and export the exact assumptions and witnesses. It does not invent temporal accessibility or transit routing. A synthetic benchmark only checks implementation correctness within its model. Real timetable integration and operator usefulness remain to be evaluated.

## Authorship and release boundary

This is AI-assisted original implementation, testing, design and documentation, started November 8. No real participant or pantry records were used. All transit examples are original synthetic data. No account, live service, entry or operating hours are changed. Publication and entry claims require their own successful receipts. The prototype should not be represented as field tested or production ready.
