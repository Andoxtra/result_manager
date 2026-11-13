import { Box, Group, Paper, Text } from "@mantine/core";
import type { ReactNode } from "react";

/**
 * One entry of a list. Used instead of wide tables so that lists stay readable on a
 * phone: the actions move below the text when there is not enough room.
 */
export function Row({ title, children, actions }: { title: ReactNode; children?: ReactNode; actions?: ReactNode }) {
  return (
    <Paper withBorder p="sm">
      <Group justify="space-between" align="center" gap="sm">
        <Box style={{ flex: "1 1 220px", minWidth: 0 }}>
          <Text fw={600} style={{ overflowWrap: "anywhere" }}>
            {title}
          </Text>
          {children && (
            <Group gap={8} mt={2} c="dimmed" fz="sm" style={{ overflowWrap: "anywhere" }}>
              {children}
            </Group>
          )}
        </Box>
        {actions && (
          <Group gap="xs" wrap="nowrap">
            {actions}
          </Group>
        )}
      </Group>
    </Paper>
  );
}
