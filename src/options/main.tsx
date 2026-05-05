import { render } from "solid-js/web";
import { OptionsApp } from "./options-app";

const root = document.getElementById("root");
if (root) render(() => <OptionsApp />, root);
