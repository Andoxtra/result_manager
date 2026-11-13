import { Alert, Badge, Button, Group, Modal, NumberInput, SegmentedControl, Stack, Text, TextInput, Title } from "@mantine/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { api, type Card } from "../api";
import { EventPicker, useEventChoice } from "../components/EventPicker";
import { Row } from "../components/Row";
import { cardResultText, finalTimeCs, formatTime, isScored, parseTime, timeInputValue } from "../format";
import { notifyError, notifySuccess } from "../notify";

function ResultForm({ card, onDone }: { card: Card; onDone: () => void }) {
  const queryClient = useQueryClient();
  const isTime = card.discipline.scoringType === "TIME";
  const [score, setScore] = useState<number | string>(card.score ?? "");
  const [time, setTime] = useState(card.rawTimeCs !== null ? timeInputValue(card.rawTimeCs) : "");
  const [penalties, setPenalties] = useState<number | string>(card.penalties ?? 0);

  const rawTimeCs = parseTime(time);
  const penaltyCount = typeof penalties === "number" && Number.isInteger(penalties) && penalties >= 0 ? penalties : null;
  const scoreValue =
    typeof score === "number" && Number.isInteger(score) && score >= 0 && score <= card.discipline.maxScore ? score : null;
  const valid = isTime ? rawTimeCs !== null && penaltyCount !== null : scoreValue !== null;

  const done = (message: string) => {
    notifySuccess(message);
    queryClient.invalidateQueries({ queryKey: ["cards", card.eventId] });
    queryClient.invalidateQueries({ queryKey: ["evaluation", card.eventId] });
    onDone();
  };

  const save = useMutation({
    mutationFn: () =>
      api.put<Card>(`/cards/${card.id}/result`, isTime ? { rawTimeCs, penalties: penaltyCount } : { score: scoreValue }),
    onSuccess: () => done(`Ergebnis für Karte ${card.cardNumber} gespeichert.`),
    onError: notifyError,
  });
  const clear = useMutation({
    mutationFn: () => api.delete(`/cards/${card.id}/result`),
    onSuccess: () => done(`Ergebnis für Karte ${card.cardNumber} gelöscht.`),
    onError: notifyError,
  });

  function submit(e: FormEvent) {
    e.preventDefault();
    if (valid) save.mutate();
  }

  return (
    <form onSubmit={submit}>
      <Stack>
        <Text>
          Schütze Nr. <b>{card.shooter.number}</b> – <b>{card.shooter.name}</b>
          <br />
          {card.discipline.name}
          {card.rebuy && " (nachgelöst)"}
        </Text>

        {isTime ? (
          <>
            <TextInput
              label="Zeit"
              description="Sekunden mit Hundertstel, z. B. 47,35 – oder Minuten:Sekunden, z. B. 1:02,35"
              value={time}
              onChange={(e) => setTime(e.currentTarget.value)}
              error={time !== "" && rawTimeCs === null ? "Keine gültige Zeit" : undefined}
              inputMode="text"
              autoComplete="off"
              data-autofocus
            />
            <NumberInput
              label="Fehler"
              description={`Fehlschüsse und nicht erfüllte Aufgaben, je ${card.discipline.penaltySeconds} Sekunden`}
              value={penalties}
              onChange={setPenalties}
              min={0}
              max={999}
              allowDecimal={false}
              allowNegative={false}
            />
            <Text>
              Endzeit:{" "}
              <b>{rawTimeCs !== null && penaltyCount !== null ? formatTime(finalTimeCs(rawTimeCs, penaltyCount, card.discipline)) : "–"}</b>
            </Text>
          </>
        ) : (
          <NumberInput
            label="Gesamtpunktzahl"
            description={`0 bis ${card.discipline.maxScore}`}
            value={score}
            onChange={setScore}
            min={0}
            max={card.discipline.maxScore}
            clampBehavior="none"
            error={score !== "" && scoreValue === null ? `Ganze Zahl von 0 bis ${card.discipline.maxScore}` : undefined}
            allowDecimal={false}
            allowNegative={false}
            data-autofocus
          />
        )}

        <Group justify="space-between">
          {isScored(card) ? (
            <Button
              variant="subtle"
              color="red"
              loading={clear.isPending}
              onClick={() => window.confirm("Das erfasste Ergebnis wirklich löschen?") && clear.mutate()}
            >
              Ergebnis löschen
            </Button>
          ) : (
            <span />
          )}
          <Button type="submit" loading={save.isPending} disabled={!valid}>
            Speichern
          </Button>
        </Group>
      </Stack>
    </form>
  );
}

export function ScoringPage() {
  const choice = useEventChoice();
  const event = choice.event;
  const [search, setSearch] = useState("");
  const [show, setShow] = useState<"open" | "scored" | "all">("open");
  const [editing, setEditing] = useState<Card | null>(null);

  const cards = useQuery({
    queryKey: ["cards", event?.id],
    queryFn: () => api.get<Card[]>(`/events/${event!.id}/cards`),
    enabled: !!event,
    refetchInterval: 10_000,
  });

  const all = cards.data ?? [];
  const openCount = all.filter((c) => !isScored(c)).length;
  const term = search.trim().toLowerCase();
  const visible = all
    .filter((c) => show === "all" || (show === "open") === !isScored(c))
    .filter(
      (c) =>
        term === "" ||
        String(c.cardNumber) === term ||
        String(c.shooter.number) === term ||
        c.shooter.name.toLowerCase().includes(term),
    )
    .sort((a, b) => a.cardNumber - b.cardNumber);

  return (
    <Stack>
      <Title order={2}>Ergebniserfassung</Title>
      <EventPicker choice={choice} />

      {event && (
        <>
          <Group align="flex-end">
            <TextInput
              label="Karte suchen"
              placeholder="Kartennummer, Schützennummer oder Name"
              value={search}
              onChange={(e) => setSearch(e.currentTarget.value)}
              autoComplete="off"
              style={{ flex: "1 1 240px", maxWidth: 360 }}
            />
            <SegmentedControl
              value={show}
              onChange={(value) => setShow(value as typeof show)}
              data={[
                { value: "open", label: `Offen (${openCount})` },
                { value: "scored", label: `Erfasst (${all.length - openCount})` },
                { value: "all", label: "Alle" },
              ]}
            />
          </Group>

          {cards.error && <Alert color="red">{cards.error.message}</Alert>}
          {cards.isSuccess && visible.length === 0 && <Text c="dimmed">Keine Karten gefunden.</Text>}

          <Stack gap="xs">
            {visible.map((card) => (
              <Row
                key={card.id}
                title={`Karte ${card.cardNumber} · Nr. ${card.shooter.number} ${card.shooter.name}`}
                actions={
                  <Button variant={isScored(card) ? "default" : "filled"} onClick={() => setEditing(card)}>
                    {isScored(card) ? "Korrigieren" : "Erfassen"}
                  </Button>
                }
              >
                <span>{card.discipline.name}</span>
                {card.rebuy && <Badge variant="light">Nachgelöst</Badge>}
                {isScored(card) ? <span>{cardResultText(card)}</span> : <Badge color="gray" variant="light">offen</Badge>}
              </Row>
            ))}
          </Stack>
        </>
      )}

      <Modal opened={!!editing} onClose={() => setEditing(null)} title={editing ? `Karte ${editing.cardNumber}` : ""}>
        {editing && <ResultForm key={editing.id} card={editing} onDone={() => setEditing(null)} />}
      </Modal>
    </Stack>
  );
}
