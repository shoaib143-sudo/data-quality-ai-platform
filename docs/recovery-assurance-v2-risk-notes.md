# Risk notes

The branch introduces no destructive production action. The schema change is forward-only. The destructive restore runner remains manual-only and requires both explicit confirmation and an isolated target. Production migration application and full restore rehearsal must occur through the governed release path.
