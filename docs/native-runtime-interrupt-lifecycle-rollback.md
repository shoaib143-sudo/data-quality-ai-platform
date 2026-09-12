# Native runtime interrupt lifecycle rollback safety

The migration adds new evidence tables and replaces existing function bodies without removing prior interrupt data. Rolling application code back leaves the new database evidence intact. Expired or rejected terminal outcomes must not be reversed by rollback.
