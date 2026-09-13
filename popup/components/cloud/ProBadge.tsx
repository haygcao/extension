import { Badge } from "@mantine/core";
import { VERSION } from "~utils/version";

export const ProBadge = () => {
  return (
    <Badge size="xs" color="indigo" variant="light">
      v{VERSION}
    </Badge>
  );
};
