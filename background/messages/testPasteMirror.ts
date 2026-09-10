import type { PlasmoMessaging } from "@plasmohq/messaging";

import { getSettings } from "~storage/settings";
import { mirrorToPaste, type MirrorResult } from "~utils/paste/mirror";

export interface TestPasteMirrorRequestBody {
  content?: string;
}

export type TestPasteMirrorResponseBody = MirrorResult;

// Lets the settings UI send a sample item to Paste and surface the result
// (including the tool names Paste exposed) so a connection can be verified
// without waiting for a real clipboard capture.
const handler: PlasmoMessaging.MessageHandler<
  TestPasteMirrorRequestBody,
  TestPasteMirrorResponseBody
> = async (req, res) => {
  const settings = await getSettings();
  const content = req.body?.content ?? `Clipboard History test — ${new Date().toISOString()}`;

  res.send(
    await mirrorToPaste(content, { url: settings.pasteMcpUrl, token: settings.pasteMcpToken }),
  );
};

export default handler;
