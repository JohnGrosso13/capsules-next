import * as React from "react";

import {
  buildDoubleEliminationBracket,
  buildSingleEliminationBracket,
  type TournamentBracket,
} from "@/lib/ladders/bracket";
import type { CapsuleLadderMember, LadderMatchRecord } from "@/types/ladders";

type UseTournamentBracketOptions = {
  format: "single_elimination" | "double_elimination" | "round_robin";
  members?: CapsuleLadderMember[] | null;
  history?: LadderMatchRecord[] | null;
};

export function useTournamentBracket({
  format,
  members,
  history,
}: UseTournamentBracketOptions): TournamentBracket {
  return React.useMemo(() => {
    const memberList = members ?? [];
    const matchHistory = history ?? [];
    if (format === "double_elimination") {
      return buildDoubleEliminationBracket(memberList, matchHistory);
    }
    return buildSingleEliminationBracket(memberList, matchHistory);
  }, [format, history, members]);
}
