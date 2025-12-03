import * as React from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import styles from "../../ladders/LadderBuilder.module.css";

type TournamentStatusProps = {
  error?: string | null;
  status?: string | null;
};

export const TournamentStatus = React.memo(function TournamentStatus({
  error,
  status,
}: TournamentStatusProps) {
  if (!error && !status) return null;
  return (
    <div className={styles.toastStack}>
      {error ? (
        <Alert tone="danger">
          <AlertTitle>Tournament builder</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      {status ? (
        <Alert tone="success">
          <AlertTitle>Saved</AlertTitle>
          <AlertDescription>{status}</AlertDescription>
        </Alert>
      ) : null}
    </div>
  );
});
