import { Button, Card, Center, MantineProvider, Stack, Text, Title } from "@mantine/core";
import React from "react";

import { useTheme } from "~popup/hooks/useTheme";

import "./sign-in.css";

export default function Page() {
  const theme = useTheme();

  return (
    <MantineProvider theme={theme} withGlobalStyles withNormalizeCSS>
      <Center h="100vh">
        <Card p="xl" w={400} shadow="md">
          <Stack align="center" spacing="md">
            <Title order={4}>Sync Settings Moved</Title>
            <Text size="sm" align="center" color="dimmed">
              Cloud sync is now configured directly in the extension settings.
              Open the extension and go to <b>Settings → Cloud</b> to choose your sync provider
              (Chrome Sync, WebDAV, etc.).
            </Text>
            <Button
              size="xs"
              onClick={() => window.close()}
            >
              Close
            </Button>
          </Stack>
        </Card>
      </Center>
    </MantineProvider>
  );
}
