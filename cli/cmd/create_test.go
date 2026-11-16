package cmd

import (
	"strings"
	"testing"
)

func TestResolveCreateStatus(t *testing.T) {
	statuses := []status{
		{ID: "1", Name: "To Do"},
		{ID: "2", Name: "In Progress"},
		{ID: "3", Name: "Done"},
	}

	t.Run("returns explicit flag value", func(t *testing.T) {
		s, err := resolveCreateStatus(statuses, "In Progress", true, "")
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if s.ID != "2" {
			t.Errorf("got ID %q, want %q", s.ID, "2")
		}
	})

	t.Run("errors on unknown flag value", func(t *testing.T) {
		_, err := resolveCreateStatus(statuses, "Nonexistent", true, "")
		if err == nil {
			t.Fatal("expected error, got nil")
		}
	})

	t.Run("falls back to config default", func(t *testing.T) {
		s, err := resolveCreateStatus(statuses, "", false, "In Progress")
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if s.ID != "2" {
			t.Errorf("got ID %q, want %q", s.ID, "2")
		}
	})

	// Without a flag or a configured status the project has, the CLI names none and
	// the server picks: taking the first row started cards in Done wherever Done was
	// the oldest status.
	t.Run("leaves the choice to the server when config default not found", func(t *testing.T) {
		s, err := resolveCreateStatus(statuses, "", false, "Nonexistent")
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if s != nil {
			t.Errorf("got %q, want nil", s.Name)
		}
	})

	t.Run("leaves the choice to the server when no config default", func(t *testing.T) {
		s, err := resolveCreateStatus([]status{{ID: "3", Name: "Done"}, {ID: "1", Name: "Backlog"}}, "", false, "")
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if s != nil {
			t.Errorf("got %q, want nil", s.Name)
		}
	})

	t.Run("errors on empty statuses", func(t *testing.T) {
		_, err := resolveCreateStatus([]status{}, "", false, "")
		if err == nil {
			t.Fatal("expected error, got nil")
		}
	})

	t.Run("flag takes precedence over config default", func(t *testing.T) {
		s, err := resolveCreateStatus(statuses, "Done", true, "To Do")
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if s.ID != "3" {
			t.Errorf("got ID %q, want %q", s.ID, "3")
		}
	})
}

func TestFormatCardSubtasks(t *testing.T) {
	c := &cardResponse{
		card:     card{ID: 12, Title: "Parent", StatusID: "1"},
		Project:  &projectInfo{Key: "TK"},
		Statuses: []status{{ID: "1", Name: "To Do"}, {ID: "3", Name: "Done"}},
		SubtaskCards: []subtaskRef{
			{Ticket: "TK-13", Title: "First", StatusID: "1"},
			{Ticket: "TK-14", Title: "Second", StatusID: "3"},
		},
	}
	out := formatCard(c)
	for _, want := range []string{"subtasks:\n", "  TK-13 [To Do] First\n", "  TK-14 [Done] Second\n"} {
		if !strings.Contains(out, want) {
			t.Errorf("formatCard output missing %q:\n%s", want, out)
		}
	}

	sub := &cardResponse{card: card{ID: 13, Title: "First"}, Parent: &subtaskRef{Ticket: "TK-12", Title: "Parent"}}
	if out := formatCard(sub); !strings.Contains(out, "TK-12 Parent") {
		t.Errorf("sub-task output missing its parent:\n%s", out)
	}
}
