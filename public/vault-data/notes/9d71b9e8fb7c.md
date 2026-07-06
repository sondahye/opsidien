# Flood Risk Model

Logistic regression over rainfall + drainage capacity, refreshed hourly from the KMA feed.

Belongs to [[Infrastructure]]. Ships alerts through [[침수 알림 서비스]].

- features: rainfall intensity, inlet clogging, slope
- validation against [[Seoul Rainfall Data]]
- threshold tuned for *recall* over precision — a missed flood costs more than a false alarm
