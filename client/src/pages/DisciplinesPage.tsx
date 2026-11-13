import { Alert, Badge, Button, Group, Loader, Modal, NumberInput, Select, Stack, Switch, Table, TextInput, Title } from "@mantine/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { api, type Discipline, type ScoringType } from "../api";
import { notifyError, notifySuccess } from "../notify";

const TYPE_LABELS: Record<ScoringType, string> = {
  POINTS: "Punkte (höchste Punktzahl gewinnt)",
  TIME: "Zeit mit Fehlern (kürzeste Endzeit gewinnt)",
};

function DisciplineForm({ discipline, onDone }: { discipline: Discipline | null; onDone: () => void }) {
  const queryClient = useQueryClient();
  const [name, setName] = useState(discipline?.name ?? "");
  const [scoringType, setScoringType] = useState<ScoringType>(discipline?.scoringType ?? "POINTS");
  const [maxScore, setMaxScore] = useState<number | string>(discipline?.maxScore ?? 100);
  const [penaltySeconds, setPenaltySeconds] = useState<number | string>(discipline?.penaltySeconds ?? 5);
  const [active, setActive] = useState(discipline?.active ?? true);

  const save = useMutation({
    mutationFn: () => {
      const body = {
        name: name.trim(),
        scoringType,
        active,
        ...(scoringType === "POINTS" ? { maxScore: Number(maxScore) } : { penaltySeconds: Number(penaltySeconds) }),
      };
      return discipline ? api.patch(`/disciplines/${discipline.id}`, body) : api.post("/disciplines", body);
    },
    onSuccess: () => {
      notifySuccess("Disziplin gespeichert.");
      queryClient.invalidateQueries({ queryKey: ["disciplines"] });
      queryClient.invalidateQueries({ queryKey: ["events"] });
      onDone();
    },
    onError: notifyError,
  });

  function submit(e: FormEvent) {
    e.preventDefault();
    save.mutate();
  }

  return (
    <form onSubmit={submit}>
      <Stack>
        <TextInput label="Name" value={name} onChange={(e) => setName(e.currentTarget.value)} maxLength={100} required data-autofocus />
        <Select
          label="Wertung"
          data={Object.entries(TYPE_LABELS).map(([value, label]) => ({ value, label }))}
          value={scoringType}
          onChange={(value) => value && setScoringType(value as ScoringType)}
          allowDeselect={false}
        />
        {scoringType === "POINTS" ? (
          <NumberInput label="Höchstpunktzahl" description="Größte Gesamtpunktzahl, die erfasst werden kann" value={maxScore} onChange={setMaxScore} min={1} allowDecimal={false} required />
        ) : (
          <NumberInput label="Strafzeit je Fehler (Sekunden)" value={penaltySeconds} onChange={setPenaltySeconds} min={0} allowDecimal={false} required />
        )}
        <Switch label="Aktiv (für neue Veranstaltungen auswählbar)" checked={active} onChange={(e) => setActive(e.currentTarget.checked)} />
        <Button type="submit" loading={save.isPending} disabled={!name.trim()}>
          Speichern
        </Button>
      </Stack>
    </form>
  );
}

export function DisciplinesPage() {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<{ discipline: Discipline | null } | null>(null);
  const disciplines = useQuery({ queryKey: ["disciplines"], queryFn: () => api.get<Discipline[]>("/disciplines") });

  const remove = useMutation({
    mutationFn: (d: Discipline) => api.delete(`/disciplines/${d.id}`),
    onSuccess: () => {
      notifySuccess("Disziplin gelöscht.");
      queryClient.invalidateQueries({ queryKey: ["disciplines"] });
    },
    onError: notifyError,
  });

  return (
    <Stack>
      <Group justify="space-between">
        <Title order={2}>Disziplinen</Title>
        <Button onClick={() => setForm({ discipline: null })}>Neue Disziplin</Button>
      </Group>
      {disciplines.isPending && <Loader />}
      {disciplines.error && <Alert color="red">{disciplines.error.message}</Alert>}
      {disciplines.data && (
        <Table.ScrollContainer minWidth={560}>
          <Table striped>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Name</Table.Th>
                <Table.Th>Wertung</Table.Th>
                <Table.Th>Status</Table.Th>
                <Table.Th />
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {disciplines.data.map((d) => (
                <Table.Tr key={d.id}>
                  <Table.Td>{d.name}</Table.Td>
                  <Table.Td>
                    {d.scoringType === "POINTS" ? `Punkte, höchstens ${d.maxScore}` : `Zeit, ${d.penaltySeconds} s je Fehler`}
                  </Table.Td>
                  <Table.Td>
                    <Badge color={d.active ? "green" : "gray"}>{d.active ? "aktiv" : "deaktiviert"}</Badge>
                  </Table.Td>
                  <Table.Td>
                    <Group gap="xs" justify="flex-end" wrap="nowrap">
                      <Button size="compact-sm" variant="default" onClick={() => setForm({ discipline: d })}>
                        Bearbeiten
                      </Button>
                      <Button
                        size="compact-sm"
                        variant="subtle"
                        color="red"
                        onClick={() => window.confirm(`Disziplin „${d.name}“ wirklich löschen?`) && remove.mutate(d)}
                      >
                        Löschen
                      </Button>
                    </Group>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      )}
      <Modal opened={!!form} onClose={() => setForm(null)} title={form?.discipline ? "Disziplin bearbeiten" : "Neue Disziplin"}>
        {form && <DisciplineForm key={form.discipline?.id ?? "new"} discipline={form.discipline} onDone={() => setForm(null)} />}
      </Modal>
    </Stack>
  );
}
