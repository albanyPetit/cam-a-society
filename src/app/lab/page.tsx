import type { Metadata } from "next";
import { Lab } from "./lab";

// Internal tool for tuning the film preset. Photos never leave the browser,
// so it's safe to keep online; it's just not linked or indexed.
export const metadata: Metadata = {
  title: "Film lab · A Society Cam",
  robots: { index: false, follow: false },
};

export default function LabPage() {
  return <Lab />;
}
