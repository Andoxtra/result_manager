import { Alert, Badge, Button, Group, Loader, Paper, SimpleGrid, Stack, Table, Tabs, Text, Title } from "@mantine/core";
import { useQuery } from "@tanstack/react-query";
import { api, type Evaluation } from "../api";
import { useAuth } from "../auth";
import { Row } from "./Row";
import { formatDate, formatTime, STATUS_COLORS, STATUS_LABELS } from "../format";

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
      {/* On a phone the time details move below the final time and the card count is left out. */}
      <Table striped>
        <Table.Thead>
          <Table.Tr>
            <Table.Th ta="right" w={56}>Platz</Table.Th>
            <Table.Th ta="right" w={48}>Nr.</Table.Th>
            <Table.Th>Name</Table.Th>
            {isTime ? (
              <>
                <Table.Th ta="right" visibleFrom="sm">Zeit</Table.Th>
                <Table.Th ta="right" visibleFrom="sm">Fehler</Table.Th>
                <Table.Th ta="right">Endzeit</Table.Th>
              </>
            ) : (
              <Table.Th ta="right">Punkte</Table.Th>
            )}
            <Table.Th ta="right" visibleFrom="sm">Karten</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {rows.map((row) => (
            <Table.Tr key={row.shooterId}>
              <Table.Td ta="right" fw={row.place <= 3 ? 700 : undefined}>{row.place}.</Table.Td>
              <Table.Td ta="right">{row.shooterNumber}</Table.Td>
              <Table.Td style={{ overflowWrap: "break-word" }}>{row.shooterName}</Table.Td>
              {isTime ? (
                <>
                  <Table.Td ta="right" visibleFrom="sm">{formatTime(row.rawTimeCs!)}</Table.Td>
                  <Table.Td ta="right" visibleFrom="sm">{row.penalties}</Table.Td>
                  <Table.Td ta="right" style={{ whiteSpace: "nowrap" }}>
                    <Text fw={700} inherit>{formatTime(row.finalTimeCs!)}</Text>
                    <Text size="xs" c="dimmed" hiddenFrom="sm">
                      {formatTime(row.rawTimeCs!)} + {row.penalties} Fehler
                    </Text>
                  </Table.Td>
                </>
              ) : (
                <Table.Td ta="right" fw={700}>{row.score}</Table.Td>
              )}
              <Table.Td ta="right" visibleFrom="sm">{row.cardCount}</Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
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
    return <Alert color="red">{error.message}</Alert>;
  }

  const { event, statistics, rankings } = data;
  return (
    <Stack>
      <Group justify="space-between" align="flex-start">
        <div>
          <Group gap="sm">
            <Title order={3}>{event.name}</Title>
            <Badge color={STATUS_COLORS[event.status]}>{STATUS_LABELS[event.status]}</Badge>
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

      <SimpleGrid cols={{ base: 2, sm: 4 }}>
        <Stat label="Schützen" value={statistics.shooters} />
        <Stat label="Schießkarten" value={statistics.cardsIssued} />
        <Stat label="Davon nachgelöst" value={statistics.cardsRebought} />
        <Stat label="Ohne Ergebnis" value={statistics.cardsOpen} />
      </SimpleGrid>

      {/* five columns do not fit on a phone: there each discipline gets a line of its own */}
      <Stack gap="xs" hiddenFrom="sm">
        {statistics.disciplines.map((d) => (
          <Row key={d.disciplineId} title={d.name}>
            <span>{d.shooters} Schützen</span>
            <span>{d.cards} Karten</span>
            <span>{d.rebuys} nachgelöst</span>
            <span>{d.openCards} offen</span>
          </Row>
        ))}
      </Stack>
      <Table visibleFrom="sm">
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Disziplin</Table.Th>
            <Table.Th ta="right">Schützen</Table.Th>
            <Table.Th ta="right">Karten</Table.Th>
            <Table.Th ta="right">Nachgelöst</Table.Th>
            <Table.Th ta="right">Ohne Ergebnis</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {statistics.disciplines.map((d) => (
            <Table.Tr key={d.disciplineId}>
              <Table.Td>{d.name}</Table.Td>
              <Table.Td ta="right">{d.shooters}</Table.Td>
              <Table.Td ta="right">{d.cards}</Table.Td>
              <Table.Td ta="right">{d.rebuys}</Table.Td>
              <Table.Td ta="right">{d.openCards}</Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>

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
