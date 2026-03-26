package cmd

import "testing"

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

	t.Run("falls back to first status when config default not found", func(t *testing.T) {
		s, err := resolveCreateStatus(statuses, "", false, "Nonexistent")
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if s.ID != "1" {
			t.Errorf("got ID %q, want %q", s.ID, "1")
		}
	})

	t.Run("falls back to first status when no config default", func(t *testing.T) {
		s, err := resolveCreateStatus(statuses, "", false, "")
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if s.ID != "1" {
			t.Errorf("got ID %q, want %q", s.ID, "1")
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
