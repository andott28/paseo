import type { JSX } from "react";
import "./global.css";
import { ScreenRouter } from "./src/navigation/screen-router";

export default function App(): JSX.Element {
  return <ScreenRouter />;
}
