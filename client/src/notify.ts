import { notifications } from "@mantine/notifications";

export const notifySuccess = (message: string) => notifications.show({ color: "green", message });

export const notifyError = (error: unknown) =>
  notifications.show({
    color: "red",
    title: "Fehler",
    message: error instanceof Error ? error.message : "Unbekannter Fehler",
  });
