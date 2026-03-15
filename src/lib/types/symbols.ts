export type SymbolEntry = {
    key:       string;
    file:      string;
    startLine: number | null;
    score:     number | null;
    role:      string | null;
    summary:   string | null;
};
