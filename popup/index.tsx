import { MantineProvider } from "@mantine/core";
import { ModalsProvider } from "@mantine/modals";
import { Notifications } from "@mantine/notifications";

import { App } from "./App";

import "./index.css";

import { AllTagsProvider } from "./contexts/AllTagsContext";
import { EntriesProvider } from "./contexts/EntriesContext";
import { EntryIdToTagsProvider } from "./contexts/EntryIdToTagsContext";
import { FavoriteEntryIdsProvider } from "./contexts/FavoriteEntryIdsContext";
import { PinnedEntryIdsProvider } from "./contexts/PinnedEntryIdsContext";
import { useTheme } from "./hooks/useTheme";

export default function IndexPopup() {
  const theme = useTheme();

  return (
    <MantineProvider theme={theme} withGlobalStyles withNormalizeCSS>
      <EntriesProvider>
        <FavoriteEntryIdsProvider>
          <PinnedEntryIdsProvider>
            <EntryIdToTagsProvider>
              <AllTagsProvider>
                <ModalsProvider>
                  <Notifications position="bottom-left" />
                  <App />
                </ModalsProvider>
              </AllTagsProvider>
            </EntryIdToTagsProvider>
          </PinnedEntryIdsProvider>
        </FavoriteEntryIdsProvider>
      </EntriesProvider>
    </MantineProvider>
  );
}
