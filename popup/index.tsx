import { MantineProvider } from "@mantine/core";
import { ModalsProvider } from "@mantine/modals";
import { Notifications } from "@mantine/notifications";

import { App } from "./App";
import { useTheme } from "./hooks/useTheme";

import "./index.css";

export default function IndexPopup() {
  const theme = useTheme();

  return (
    <MantineProvider theme={theme} withGlobalStyles withNormalizeCSS>
      <ModalsProvider>
        <Notifications position="bottom-left" />
        <App />
      </ModalsProvider>
    </MantineProvider>
  );
}
