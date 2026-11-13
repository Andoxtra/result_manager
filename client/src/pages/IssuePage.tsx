import { Alert, Anchor, Badge, Button, Group, Modal, Paper, SegmentedControl, Select, Stack, Text, TextInput, Title } from "@mantine/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { api, type Card, type Shooter } from "../api";
import { EventPicker, useEventChoice } from "../components/EventPicker";
import { Row } from "../components/Row";
import { cardResultText, isScored } from "../format";
import { notifyError, notifySuccess } from "../notify";

const matches = (term: string, ...values: (string | number)[]) =>
  term === "" || values.some((v) => (typeof v === "number" ? String(v) === term : v.toLowerCase().includes(term)));

function NewShooterForm({
  eventId,
  shooters,
  onCreated,
  onUseExisting,
}: {
  eventId: number;
  shooters: Shooter[];
  onCreated: (shooter: Shooter) => void;
  onUseExisting: (shooter: Shooter) => void;
}) {
  const [name, setName] = useState("");
  const create = useMutation({
    mutationFn: () => api.post<Shooter>(`/events/${eventId}/shooters`, { name: name.trim() }),
    onSuccess: onCreated,
    onError: notifyError,
  });
  // someone who is already registered is easily entered a second time
  const sameName = name.trim()
    ? shooters.find((s) => s.name.trim().toLowerCase() === name.trim().toLowerCase())
    : undefined;

  function submit(e: FormEvent) {
    e.preventDefault();
    if (name.trim()) create.mutate();
  }

  return (
    <form onSubmit={submit}>
      <Stack>
        <TextInput
          label="Name des Schützen"
          description="Wie in der Teilnehmerliste eingetragen. Die Schützennummer wird automatisch vergeben."
          value={name}
          onChange={(e) => setName(e.currentTarget.value)}
          maxLength={100}
          autoComplete="off"
          data-autofocus
        />
        {sameName && (
          <Alert color="yellow">
            Es gibt bereits einen Schützen mit diesem Namen (Nr. {sameName.number}).{" "}
            <Anchor component="button" type="button" onClick={() => onUseExisting(sameName)}>
              Diesen Schützen verwenden
            </Anchor>
          </Alert>
        )}
        <Button type="submit" loading={create.isPending} disabled={!name.trim()}>
          Schütze anlegen
        </Button>
      </Stack>
    </form>
  );
}

export function IssuePage() {
  const choice = useEventChoice();
  const { event, isAdmin } = choice;
  const queryClient = useQueryClient();

  const [shooterId, setShooterId] = useState<string | null>(null);
  const [disciplineId, setDisciplineId] = useState<string | null>(null);
  const [lastCard, setLastCard] = useState<Card | null>(null);
  const [newShooterOpen, setNewShooterOpen] = useState(false);
  const [list, setList] = useState<"cards" | "shooters">("cards");
  const [search, setSearch] = useState("");

  const shooters = useQuery({
    queryKey: ["shooters", event?.id],
    queryFn: () => api.get<Shooter[]>(`/events/${event!.id}/shooters`),
    enabled: !!event,
    refetchInterval: 10_000,
  });
  const cards = useQuery({
    queryKey: ["cards", event?.id],
    queryFn: () => api.get<Card[]>(`/events/${event!.id}/cards`),
    enabled: !!event,
    refetchInterval: 10_000,
  });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["shooters", event?.id] });
    queryClient.invalidateQueries({ queryKey: ["cards", event?.id] });
    queryClient.invalidateQueries({ queryKey: ["events"] });
  };

  const issue = useMutation({
    mutationFn: (body: object) => api.post<Card>(`/events/${event!.id}/cards`, body),
    onSuccess: (card) => {
      setLastCard(card);
      setShooterId(null);
      refresh();
    },
    onError: notifyError,
  });
  const removeCard = useMutation({
    mutationFn: (card: Card) => api.delete(`/cards/${card.id}`),
    onSuccess: (_data, card) => {
      notifySuccess(`Karte ${card.cardNumber} wurde zurückgenommen.`);
      if (lastCard?.id === card.id) setLastCard(null);
      refresh();
    },
    onError: notifyError,
  });
  const renameShooter = useMutation({
    mutationFn: ({ shooter, name }: { shooter: Shooter; name: string }) => api.patch(`/shooters/${shooter.id}`, { name }),
    onSuccess: refresh,
    onError: notifyError,
  });
  const removeShooter = useMutation({
    mutationFn: (shooter: Shooter) => api.delete(`/shooters/${shooter.id}`),
    onSuccess: (_data, shooter) => {
      notifySuccess(`Schütze Nr. ${shooter.number} wurde gelöscht.`);
      if (shooterId === String(shooter.id)) setShooterId(null);
      refresh();
    },
    onError: notifyError,
  });

  const allShooters = shooters.data ?? [];
  const allCards = cards.data ?? [];
  const disciplines = event?.disciplines ?? [];
  const selectedShooter = allShooters.find((s) => String(s.id) === shooterId) ?? null;
  const selectedDiscipline =
    disciplines.find((d) => String(d.id) === disciplineId) ?? (disciplines.length === 1 ? disciplines[0] : null);

  // "Nachlösen": the shooter already has a card for this discipline
  const previousCards =
    selectedShooter && selectedDiscipline
      ? allCards.filter((c) => c.shooter.id === selectedShooter.id && c.discipline.id === selectedDiscipline.id).length
      : 0;
  const canSubmit = !!selectedShooter && !!selectedDiscipline;

  function submit(e: FormEvent) {
    e.preventDefault();
    if (canSubmit) issue.mutate({ shooterId: selectedShooter.id, disciplineId: selectedDiscipline.id });
  }

  const term = search.trim().toLowerCase();
  const visibleCards = allCards.filter((c) => matches(term, c.cardNumber, c.shooter.number, c.shooter.name));
  const visibleShooters = allShooters.filter((s) => matches(term, s.number, s.name));

  return (
    <Stack>
      <Title order={2}>Kartenausgabe</Title>
      <EventPicker choice={choice} />

      {event && (
        <Paper withBorder p="md" maw={560}>
          <form onSubmit={submit}>
            <Stack>
              <Select
                label="Schütze"
                description="Schützennummer oder Name eingeben"
                placeholder="Schütze suchen"
                searchable
                clearable
                nothingFoundMessage="Kein Schütze gefunden – bitte neu anlegen"
                data={allShooters.map((s) => ({ value: String(s.id), label: `${s.number} – ${s.name}` }))}
                value={shooterId}
                onChange={setShooterId}
              />
              <Button variant="light" onClick={() => setNewShooterOpen(true)}>
                Neuen Schützen anlegen
              </Button>
              <Select
                label="Disziplin"
                placeholder="Disziplin wählen"
                data={disciplines.map((d) => ({ value: String(d.id), label: d.name }))}
                value={selectedDiscipline ? String(selectedDiscipline.id) : null}
                onChange={setDisciplineId}
                allowDeselect={false}
              />
              {previousCards > 0 && (
                <Alert color="blue" title="Nachlösen">
                  {selectedShooter!.name} hat für {selectedDiscipline!.name} bereits {previousCards}{" "}
                  {previousCards === 1 ? "Karte" : "Karten"} erhalten.
                </Alert>
              )}
              <Button type="submit" size="md" loading={issue.isPending} disabled={!canSubmit}>
                {previousCards > 0 ? "Nachlösen" : "Schießkarte ausgeben"}
              </Button>
            </Stack>
          </form>
        </Paper>
      )}

      {lastCard && lastCard.eventId === event?.id && (
        <Alert
          color="green"
          maw={560}
          title={`${lastCard.rebuy ? "Nachgelöst" : "Schießkarte ausgegeben"} – bitte auf die Karte schreiben`}
        >
          <Group gap="xl">
            <div>
              <Text size="sm" c="dimmed">Karte</Text>
              <Text fw={700} size="xl">{lastCard.cardNumber}</Text>
            </div>
            <div>
              <Text size="sm" c="dimmed">Schützennummer</Text>
              <Text fw={700} size="xl">{lastCard.shooter.number}</Text>
            </div>
            <div>
              <Text size="sm" c="dimmed">Name</Text>
              <Text fw={700} size="xl">{lastCard.shooter.name}</Text>
            </div>
            <div>
              <Text size="sm" c="dimmed">Disziplin</Text>
              <Text fw={700} size="xl">{lastCard.discipline.name}</Text>
            </div>
          </Group>
        </Alert>
      )}

      {event && (
        <>
          <Group align="flex-end" mt="md">
            <SegmentedControl
              value={list}
              onChange={(value) => setList(value as typeof list)}
              data={[
                { value: "cards", label: `Karten (${allCards.length})` },
                { value: "shooters", label: `Schützen (${allShooters.length})` },
              ]}
            />
            <TextInput
              aria-label="Liste durchsuchen"
              placeholder="Nummer oder Name"
              value={search}
              onChange={(e) => setSearch(e.currentTarget.value)}
              autoComplete="off"
              style={{ flex: "1 1 180px", maxWidth: 320 }}
            />
          </Group>
          {(cards.error ?? shooters.error) && <Alert color="red">{(cards.error ?? shooters.error)!.message}</Alert>}

          {list === "cards" ? (
            <Stack gap="xs">
              {visibleCards.length === 0 && <Text c="dimmed">Keine Karten.</Text>}
              {visibleCards.map((card) => (
                <Row
                  key={card.id}
                  title={`Karte ${card.cardNumber} · Nr. ${card.shooter.number} ${card.shooter.name}`}
                  actions={
                    (!isScored(card) || isAdmin) && (
                      <Button
                        variant="subtle"
                        color="red"
                        onClick={() => {
                          const warning = isScored(card) ? " Das erfasste Ergebnis geht dabei verloren." : "";
                          if (window.confirm(`Karte ${card.cardNumber} von ${card.shooter.name} wirklich zurücknehmen?${warning}`)) {
                            removeCard.mutate(card);
                          }
                        }}
                      >
                        Zurücknehmen
                      </Button>
                    )
                  }
                >
                  <span>{card.discipline.name}</span>
                  {card.rebuy && <Badge variant="light">Nachgelöst</Badge>}
                  {isScored(card) ? <span>{cardResultText(card)}</span> : <Badge color="gray" variant="light">offen</Badge>}
                </Row>
              ))}
            </Stack>
          ) : (
            <Stack gap="xs">
              {visibleShooters.length === 0 && <Text c="dimmed">Keine Schützen.</Text>}
              {visibleShooters.map((shooter) => (
                <Row
                  key={shooter.id}
                  title={`Nr. ${shooter.number} · ${shooter.name}`}
                  actions={
                    <>
                      <Button
                        variant="default"
                        onClick={() => {
                          const name = window.prompt("Name des Schützen", shooter.name)?.trim();
                          if (name && name !== shooter.name) renameShooter.mutate({ shooter, name });
                        }}
                      >
                        Umbenennen
                      </Button>
                      {shooter.cardCount === 0 && (
                        <Button
                          variant="subtle"
                          color="red"
                          onClick={() =>
                            window.confirm(`Schütze Nr. ${shooter.number} ${shooter.name} wirklich löschen?`) &&
                            removeShooter.mutate(shooter)
                          }
                        >
                          Löschen
                        </Button>
                      )}
                    </>
                  }
                >
                  <span>{shooter.cardCount === 1 ? "1 Karte" : `${shooter.cardCount} Karten`}</span>
                </Row>
              ))}
            </Stack>
          )}
        </>
      )}

      <Modal opened={newShooterOpen} onClose={() => setNewShooterOpen(false)} title="Neuen Schützen anlegen">
        {event && newShooterOpen && (
          <NewShooterForm
            eventId={event.id}
            shooters={allShooters}
            onCreated={(shooter) => {
              // show the new shooter in the selection right away, before the list is reloaded
              queryClient.setQueryData<Shooter[]>(["shooters", event.id], (old) => [...(old ?? []), shooter]);
              notifySuccess(`Schütze angelegt: Nr. ${shooter.number} – ${shooter.name}`);
              setShooterId(String(shooter.id));
              setNewShooterOpen(false);
              refresh();
            }}
            onUseExisting={(shooter) => {
              setShooterId(String(shooter.id));
              setNewShooterOpen(false);
            }}
          />
        )}
      </Modal>
    </Stack>
  );
}
