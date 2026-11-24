import { createContext } from "react";

// Lets the "Details" tab's own page-level Save report "a save is in
// flight" up to the shared layout — a save kicks off several sequential
// PATCH/POST calls (variants, channels, categories), so it can take a few
// seconds. Without this, "Back to Products" and the tab links stay
// clickable the whole time and navigate away mid-save; the save itself
// keeps running in the background (fetches aren't cancelled by unmounting)
// and does complete, but it looks to the admin like "I clicked Save and it
// just dumped me back on the list" since they never saw it finish.
// Lives in its own module (not exported from layout.tsx) because Next.js's
// App Router only allows a fixed set of named exports from a layout file.
export const SetProductSavingContext = createContext<(saving: boolean) => void>(() => {});
