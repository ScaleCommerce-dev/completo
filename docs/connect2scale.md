# Entscheidungen und Abweichungen: Completo

Completo auf der connect2scale Style Guideline (Handoff vom 4. November 2026). Branch `scale-ci`, erster Durchgang am 11.11.2026.

Evidenz nach `01-grundsaetze.md`: **B** im Browser geprüft, **T** technisch geprüft (Lint, Tests), **Q** im Quellcode festgestellt, **O** offen.

## Umgesetzt

| Bereich | Umsetzung | Evidenz |
|---|---|---|
| Tokens | `app/assets/css/connect2scale-tokens.css` unverändert übernommen; `main.css` › CONNECT2SCALE bildet Nuxt UIs `--ui-*` darauf ab | B, T |
| Theme-Modell | `class="c2s-theme" data-theme` auf `<html>`, daher erben alle Portale (Dialoge, Menüs, Tooltips) das Theme | B |
| Schriften | Plus Jakarta Sans 400–800 + kursiv 400, DM Mono 400/500, Inter 400–700, lokal über `@nuxt/fonts`; `font-synthesis: none` | B |
| Shell | Sidebar und Topbar immer dunkel, Inhaltsfläche `--c2s-canvas` mit 18px-Ecke, Innenabstände nach den vier Breakpoints | B |
| Sidebar | 224px, 204px bis 1150px, eingeklappt 64px, Breite animiert 200ms; Einträge 12px auf 13×12px; aktiv ist der Eintrag mit dem längsten passenden Pfad; gleitender Aktivindikator je Gruppe (kein Flug zwischen Gruppen, Erstplatzierung statisch); Zähler als 10px-Pille; Einklappen-Schalter unten | B |
| Mobile Navigation | Sidebar ab 980px als modaler Dialog in Shell-Farben | B |
| Topbar | 52px (Phone 64px), Breadcrumb aus der Seitenspur, Theme-Schalter 64×36, Trenner 1×22px, Kontomenü mit Profil, Anmeldung und Sicherheit, API docs, Abmelden | B |
| Seitenkopf | h1 26px / −0,9px, Beschreibung, Aktionen rechts, 30px zum Inhalt, umbrechend | B |
| Scrollen | ein Scroller pro Ebene; bis 620px scrollt die ganze Inhaltsfläche unter fester Topbar; Scrollbars 8px, Thumb `--c2s-scroll-thumb`, auf Mausgeräten nur bei Hover, Forced Colors systemeigen | B |
| Inhaltsnavigation | Profil: 240px, sticky, folgt der Scrollposition, `aria-current="location"`, weiches Scrollen, ersetzt nur den Hash | B |
| Buttons | Primär Akzent/weiß/700/Radius 9, Hover #b8005a; Sekundär mit `--c2s-button-border`, Hover Canvas (in der Shell Shell-Hover); Danger gefüllt; Danger-Outline (Rahmen `--c2s-danger-border`, Hover `--c2s-danger-soft`) als Einstieg in jede destruktive Aktion; Deaktiviert neutral bei voller Deckkraft; `md`/`lg` min. 44px | B |
| Felder | Rahmen `--c2s-border` (auch selbst gebaute Felder, Eigenschaftsfelder und Kopierfelder; `--c2s-action-card-border` bleibt Erstellen-Karten und Dropzones vorbehalten), Radius 9px, `md`/`lg` min. 44px, 14px, Platzhalter `--c2s-muted` | B |
| Karten | Standardkarte Hover-Rahmen Akzent, auch die Auswahlkacheln „Board" / „List"; Erstellen-Karten (New Project, New View, Add column) 1px durchgezogen `--c2s-action-card-border`, Hover 6 % Akzent; Dropzones (Anhänge, leere Board-Spalte) 1,5px gestrichelt | B |
| Tabellen | deckender, sticky Kopf `--c2s-table-header`, Zeilen-Hover `--c2s-row-hover`, 16px Zellabstand | Q |
| Segment-Schalter, Switch | Rahmen, 3px Innenabstand, aktiv `--c2s-segment-active-*`; Switch an = Akzentfläche | B |
| Dialoge | eine Breite `min(510px, 100% − 32px)`, Radius 16px, 32px Innenabstand (Phone 24px) für Kopf, Inhalt und Aktionen über ein Token, keine Trennlinie über den Aktionen, Aktionen 28px über dem Ende, Titel 22px, Text 14px/1,8, Felder und Aktionen 44px, Schatten, Backdrop mit Blur, Ein 280ms / Aus 180ms; Löschbestätigung mit 52px-Danger-Kachel, Bestätigung im Dialog auf Danger-Soft; „Discard changes?" mit „Keep editing" / „Discard" | B |
| Karten-Panel (`CardModal`) | Fläche, Dialogschatten und Backdrop-Tönung wie Dialoge, 32px Innenabstand, Titel 22px, Ein 280ms / Aus 180ms; Anhänge als Dropzone 1,5px gestrichelt | B |
| Karten-Detailseite | Kartentitel ist der 26px-Seitentitel (an Ort und Stelle bearbeitbar), Ticket-ID als kopierbare Metadaten davor; Hauptspalte und Eigenschaften als Karten auf der Inhaltsfläche | B |
| Kontomenü | Einträge 44px, min. 210px, Chevron dreht 180° in 200ms | B |
| Zähler | Zähler neben Titeln (Abschnitte, Board-Spalten) als Pille auf `--c2s-badge` | B |
| Status- und Rollenmarken | alle `UBadge` als Pille (Radius 999px) wie die Rollenmarken der Projektkarten | B |
| Seitenkopf-Aktionen | Sekundäraktionen (Members, Settings, Mark all read, Clean up) als Sekundär-Button mit `--c2s-button-border` | B |
| Menüs | min. 210px, Einträge 12×10px, Löschen in `--c2s-danger` | B |
| Befehlspalette | Dialog-Hülle (Radius 16px, Dialogschatten, Backdrop mit Blur), Suchfeld 44px, Gruppenlabels 10px uppercase, Zeilen 12×10px, Hervorhebung `--c2s-surface-subtle`, aktuelle Seite 600 | B |
| Suche in Toolbars | 44px, max. 360px | B |
| Feedback | Erfolg/Fehler auf Soft-Fläche mit Rahmen und Textfarbe, Radius 10px, 16px, 14px/1,6; Anzeigedauer nach Regel (5s / 10s / 2,5s + 300ms je Wort / Fehler bleiben), ohne Fortschrittsbalken bei bleibenden Meldungen | B, T |
| Leerzustände | „Noch nichts vorhanden" auf `--c2s-brand-card-background` mit Primäraktion; „Keine Treffer" schlicht mit Weg zu den Filtern | B |
| Zugangsseiten | Formularspalte links, dunkler Bildbereich rechts, bis 780px nur Formular; Titel 36px/800/−1,4px (Phone 34px). Bildbereich: echte Board-Ansicht (Demo-Projekt „Spring Launch", Dark Mode, `public/auth/board-preview.jpg`) über den Rand hinaus, darüber eine Karte im Ziehen mit Ghost-Platz, wie das Board sie zeichnet; Eintritt nach Motion-Katalog „große Vorschau" | B |
| Zugang, Routing | Nach der Anmeldung zurück zum ursprünglichen Ziel (nur Pfade dieser Site) | T |
| Motion | Sammlungseintritt 420ms, Staffel 36ms bis 180ms; Tab-Inhalt 280ms; Dialog; Theme-Schalter 180ms; Reduced Motion schaltet alles ab | Q |
| Anmelde-/Abmeldeübergang | gemeinsame Zeitachse über `useAuthTransition`, Doppelauslösung gesperrt, Reduced Motion 140ms Überblendung | B (Reduced Motion), Q (volle Bewegung) |
| Fokus | Eingabeart-Modul: Tastatur 2px `--c2s-focus` Offset 2px, Maus 1px neutral nur auf Textfeldern, Shell weiß Offset 3px, `data-focus-field` für zusammengesetzte Felder, Forced Colors `Highlight` | B, T |
| Skip-Link | erster fokussierbarer Punkt, springt zur Inhaltsfläche | B |
| Texte | keine Halbgeviert- und Geviertstriche in UI-Texten und E-Mails, auch nicht als HTML-Entität | T |
| Logo | Das Completo-Zeichen bleibt unverändert; die Kachel (Sidebar, Zugangsseiten, Favicons, App-Icons, E-Mails) ist einfarbig `--c2s-accent` (#d4006a); ein Verlauf senkte den Kontrast des weißen Zeichens und wurde verworfen | B |
| E-Mails | Kopf in Shell-Farbe mit Logo auf Akzent-Kachel, Inhaltskarte 12px auf Canvas, Titel 22px, Text 14px/1,8 `--c2s-muted`, Primäraktion Akzent/weiß/700 mit 9px-Ecken (Outlook über VML), Hervorhebungen `--c2s-accent-text`, Buttons in Satzschreibung; alle sieben Vorlagen in Mailpit geprüft | B |

## Abweichungen von der Guideline

| Regel (Datei, Abschnitt) | Umsetzung in Completo | Grund | Freigabe | Testnachweis |
|---|---|---|---|---|
| `04` Buttons: Mindesthöhe aller Aktionen 44px | `md` und `lg` haben 44px; `xs`/`sm` bleiben dichte Inline-Bedienelemente auf Karten, Listenzellen und in Menüs | Ein Kanban-Board mit 44px-Zielen auf jeder Karte verliert etwa ein Drittel seiner sichtbaren Karten | offen | `app.config.ts` › `button` |
| `08` Texte: Deutsch | UI bleibt Englisch | Completo ist ein englischsprachiges Produkt; eine Übersetzung ist ein eigenes Projekt | offen | — |
| `02` Farben: `--c2s-accent` als Akzent | Nuxt UIs `text-primary` ist im Dunkelmodus `--c2s-focus` (#ff8fc3), gefüllte Primäraktionen nutzen `bg-accent` (#d4006a) | Nuxt UI hat eine Variable für Text und Fläche; #d4006a als Text auf #252533 liegt unter 3:1 | offen | `design-tokens.test.ts` › focus contrast |
| `02` Typografie: drei Textrollen | Nuxt UIs fünf Textstufen; `default` und `toned` interpoliert | Completo nutzt fünf Stufen | offen | `main.css` › CONNECT2SCALE |
| `02` Schatten: dreistufiger Kartenschatten | Versätze selbst gewählt | Handoff nennt nur die Farben | offen | `main.css` › `--elevation-raise` |
| `06` Anmelde-/Abmeldeübergang | Zeitachse nach den Werten im Handoff, Keyframes angenähert | Die exakten Keyframes stehen nur im Quellcode der Referenz, der nicht Teil des Handoffs ist | offen | `main.css` › ACCESS PAGES |
| `04` Tags | Tags behalten ihre Nutzerfarbe (`.swatch`) statt Akzent-Soft; Form (Pille) wie Guideline | Completo-Tags sind Daten mit vom Nutzer gewählter Farbe; die Farbe trägt Bedeutung | offen | `design-tokens.test.ts` › swatches |
| `04` Karten: Hover | Kanban-Karten heben sich zusätzlich an (`.lift`) | Signatur-Interaktion „Drag. Drop."; der Akzentrahmen der Guideline ist zusätzlich umgesetzt | offen | `main.css` › CARD SURFACE |
| `03` Sidebar: Vorfahr-Markierung mit Unterpfaden | Aktiv ist der Eintrag mit dem längsten passenden Pfad (ein favorisiertes Projekt bleibt auf seinen Boards aktiv); keine eingefügten Unterpfad-Einträge | Gebaut und auf Wunsch entfernt: Es fügte ein favorisiertes Projekt ein zweites Mal unter „All Projects" ein, sodass ein Klick auf den Stern-Eintrag die Markierung von diesem Eintrag wegnahm | Produkt, 12.11.2026 | `layouts/default.vue` › `activeTo` |
| `04` Karten: Hover-Rahmen Akzent | Karten mit farbiger Kante links (Projekt, Ansicht, Ticket mit Priorität) zeigen den Akzentrahmen nur oben, rechts und unten | Die Kante trägt die Farbe des Datensatzes; ein Akzentstrich direkt daneben ergab zwei gesättigte Linien nebeneinander | Produkt, 12.11.2026 | `main.css` › `.accent-edge` |
| `04` Dialoge: Backdrop-Blur | Das Karten-Panel tönt, unscharf wird nichts | Das Panel existiert, damit das Board daneben lesbar bleibt (`KanbanBoard.revealColumn`) | offen | `app.config.ts` › `slideover` |
| `02` Eingabefelder | Titel, die in einem Panel oder auf einer Seite den Datensatz selbst bearbeiten (Kartentitel, Profilname, Agentname), bleiben nahtlos; in Dialogen sind Namensfelder Kästen | Ein Titel, der an Ort und Stelle bearbeitet wird, liest sich als Überschrift, nicht als Formularfeld | offen | — |
| `07` Fokusmodell: jedes Feld zeigt Fokus | Das Suchfeld der Befehlspalette (⌘K) zeigt keine Fokuslinie | Es ist fokussiert, solange die Palette offen ist; die Linie markiert keinen Wechsel, Einfügemarke und hervorgehobene Zeile zeigen die Position. Außerhalb des Felds gezeichnet schnitt sie die runde Dialogecke | offen | `main.css` › FOCUS |
| `04` Dialoge: Breite 510px | Die Befehlspalette ist breiter (`sm:max-w-5xl`) | Sie zeigt neben der Liste eine Vorschau der markierten Karte | offen | `layouts/default.vue` |
| `02` Markenverlauf | E-Mails zeigen keinen Verlauf; das Logo steht auf einer einfarbigen Akzent-Kachel | Die meisten Mail-Programme ignorieren CSS-Verläufe und zeigen dann nichts | offen | `server/utils/email.ts` |
| `02` Schriften lokal | E-Mails nennen Plus Jakarta Sans und DM Mono nur als Wunsch mit Systemschriften als Ersatz | Mail-Programme laden keine Webfonts | offen | `server/utils/email.ts` |
| `04` Zwei benannte Fokusausnahmen | `focus:border-error*` bei Löschbestätigungen und `focus:border-secondary` beim Agent-Briefing bleiben, zusätzlich zur Outline | tragen eine Bedeutung (destruktiv, KI) | offen | `design-tokens.test.ts` › NAMED_EXCEPTIONS |

## Nicht anwendbar

| Regel | Grund |
|---|---|
| `03` Topbar: Hilfe, Sprache | Completo hat weder Hilfeseite noch Sprachwahl; die Guideline verbietet erfundene Funktionen |
| `03` Sidebar: Kontextwähler | Completo hat keinen Workspace/Mandanten |
| `03` Einstellungen: Vorschau-Spalte, Vererbung (`05`) | Completo hat keine vererbten Einstellungen mit Vorschau |
| `03` Inhaltsnavigation auf Admin › Settings | Die Seite hat einen Abschnitt; eine Navigation mit einem Eintrag führt nirgendwohin |
| `04` Diagramme, Kennzahl-Zähler, Konfetti, Medien-Dialog, Kopierfeld-Varianten | Completo hat keine Diagramme, Medien oder Konfetti; vorhandene Kopierfelder behalten ihr Verhalten |
| `05` Manuelle Sortierung mit Ziehgriff | Completo sortiert per Drag & Drop auf dem Board (SortableJS) mit eigener Tastaturführung; nicht nachgebaut |

## Offen

| ID | Bereich | Befund | Empfehlung |
|---|---|---|---|
| D01 | Abnahme | Screenreader, 200 % Zoom, Forced Colors, Touch nicht geprüft; voller Anmeldeübergang nur im Quellcode | Abnahme nach `templates/abnahme.md` in einem Browser ohne Reduced Motion |
| D02 | Sidebar | Eine Navigation aus dem mobilen Dialog wartet nicht auf dessen Schließanimation | prüfen, ob Nuxt UI das Schließen abwartet |
