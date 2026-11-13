import { Alert, Badge, Button, Group, Loader, Paper, SimpleGrid, Stack, Table, Tabs, Text, Title } from "@mantine/core";
import { useQuery } from "@tanstack/react-query";
import { api, ApiError, type Evaluation } from "../api";
import { useAuth } from "../auth";
import { formatDate, formatTime } from "../format";

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <Paper withBorder p="md">
      <Text size="sm" c="dimmed">{label}</Text>
      <Text fw={700} fz={28}>{value}</Text>
    </Paper>
  );
}

function Ranking({ ranking }: { ranking: Evaluation["rankings"][number] }) {
  const { discipline, rows } = ranking;
  const isTime = discipline.scoringType === "TIME";
  if (rows.length === 0) return <Text c="dimmed">Noch keine Ergebnisse.</Text>;
  return (
    <Stack gap="xs">
      <Table.ScrollContainer minWidth={isTime ? 620 : 420}>
        <Table striped>
          <Table.Thead>
            <Table.Tr>
              <Table.Th ta="right" w={70}>Platz</Table.Th>
              <Table.Th ta="right" w={70}>Nr.</Table.Th>
              <Table.Th>Name</Table.Th>
              {isTime ? (
                <>
                  <Table.Th ta="right">Zeit</Table.Th>
                  <Table.Th ta="right">Fehler</Table.Th>
                  <Table.Th ta="right">Endzeit</Table.Th>
                </>
              ) : (
                <Table.Th ta="right">Punkte</Table.Th>
              )}
              <Table.Th ta="right">Karten</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {rows.map((row) => (
              <Table.Tr key={row.shooterId}>
                <Table.Td ta="right" fw={row.place <= 3 ? 700 : undefined}>{row.place}.</Table.Td>
                <Table.Td ta="right">{row.shooterNumber}</Table.Td>
                <Table.Td>{row.shooterName}</Table.Td>
                {isTime ? (
                  <>
                    <Table.Td ta="right">{formatTime(row.rawTimeCs!)}</Table.Td>
                    <Table.Td ta="right">{row.penalties}</Table.Td>
                    <Table.Td ta="right" fw={700}>{formatTime(row.finalTimeCs!)}</Table.Td>
                  </>
                ) : (
                  <Table.Td ta="right" fw={700}>{row.score}</Table.Td>
                )}
                <Table.Td ta="right">{row.cardCount}</Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </Table.ScrollContainer>
      <Text size="sm" c="dimmed">
        Gewertet wird die beste Karte jedes Schützen.
        {isTime && ` Endzeit = Zeit + Fehler × ${discipline.penaltySeconds} s.`}
      </Text>
    </Stack>
  );
}

/** Statistics and rankings of one event, with the PDF export for those allowed to use it. */
export function EventResults({ eventId }: { eventId: number }) {
  const { can } = useAuth();
  const { data, error, isPending } = useQuery({
    queryKey: ["evaluation", eventId],
    queryFn: () => api.get<Evaluation>(`/events/${eventId}/evaluation`),
    refetchInterval: 15_000,
  });

  if (isPending) return <Loader />;
  if (error) {
    const forbidden = error instanceof ApiError && error.status === 403;
    return (
      <Alert color={forbidden ? "yellow" : "red"}>
        {forbidden ? "Die Ergebnisse sind erst nach Abschluss der Veranstaltung für alle sichtbar." : error.message}
      </Alert>
    );
  }

  const { event, statistics, rankings } = data;
  return (
    <Stack>
      <Group justify="space-between" align="flex-start">
        <div>
          <Group gap="sm">
            <Title order={3}>{event.name}</Title>
            <Badge color={event.status === "OPEN" ? "green" : "gray"}>
              {event.status === "OPEN" ? "läuft" : "abgeschlossen"}
            </Badge>
            {event.archivedAt && <Badge color="orange">archiviert</Badge>}
          </Group>
          <Text c="dimmed">{formatDate(event.date)}</Text>
        </div>
        {can("SCORER", "EVALUATOR") && (
          <Button component="a" href={`/api/events/${event.id}/export.pdf`} download>
            PDF exportieren
          </Button>
        )}
      </Group>

      <SimpleGrid cols={{ base: 1, xs: 3 }}>
        <Stat label="Schützen insgesamt" value={statistics.shooters} />
        <Stat label="Ausgegebene Schießkarten" value={statistics.cardsIssued} />
        <Stat label="Karten ohne Ergebnis" value={statistics.cardsOpen} />
      </SimpleGrid>

      <Table.ScrollContainer minWidth={420}>
        <Table>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Disziplin</Table.Th>
              <Table.Th ta="right">Schützen</Table.Th>
              <Table.Th ta="right">Karten</Table.Th>
              <Table.Th ta="right">Ohne Ergebnis</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {statistics.disciplines.map((d) => (
              <Table.Tr key={d.disciplineId}>
                <Table.Td>{d.name}</Table.Td>
                <Table.Td ta="right">{d.shooters}</Table.Td>
                <Table.Td ta="right">{d.cards}</Table.Td>
                <Table.Td ta="right">{d.openCards}</Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </Table.ScrollContainer>

      <Title order={4} mt="sm">Ranglisten</Title>
      {rankings.length === 0 ? (
        <Text c="dimmed">Für diese Veranstaltung sind keine Disziplinen festgelegt.</Text>
      ) : (
        <Tabs defaultValue={String(rankings[0].discipline.id)} keepMounted={false}>
          <Tabs.List>
            {rankings.map((r) => (
              <Tabs.Tab key={r.discipline.id} value={String(r.discipline.id)}>
                {r.discipline.name}
              </Tabs.Tab>
            ))}
          </Tabs.List>
          {rankings.map((r) => (
            <Tabs.Panel key={r.discipline.id} value={String(r.discipline.id)} pt="md">
              <Ranking ranking={r} />
            </Tabs.Panel>
          ))}
        </Tabs>
      )}
    </Stack>
  );
}
