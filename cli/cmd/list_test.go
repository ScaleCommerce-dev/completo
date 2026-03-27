package cmd

import (
	"strings"
	"testing"
)

func TestBuildListPath(t *testing.T) {
	t.Run("defaults only", func(t *testing.T) {
		path := buildListPath("proj-1", listCardsOpts{})
		if !strings.HasPrefix(path, "/api/projects/proj-1/cards?") {
			t.Errorf("unexpected path prefix: %s", path)
		}
		if !strings.Contains(path, "sort=position") {
			t.Error("missing sort=position")
		}
		if !strings.Contains(path, "order=asc") {
			t.Error("missing order=asc")
		}
		if strings.Contains(path, "statusId") {
			t.Error("statusId should not be present when empty")
		}
	})

	t.Run("all filters set", func(t *testing.T) {
		path := buildListPath("proj-1", listCardsOpts{
			StatusID: "status-abc",
			Priority: "high",
			Assignee: "user-123",
			Limit:    10,
		})
		for _, want := range []string{"statusId=status-abc", "priority=high", "assigneeId=user-123", "limit=10"} {
			if !strings.Contains(path, want) {
				t.Errorf("missing %q in path: %s", want, path)
			}
		}
	})

	t.Run("zero limit omitted", func(t *testing.T) {
		path := buildListPath("proj-1", listCardsOpts{Limit: 0})
		if strings.Contains(path, "limit") {
			t.Errorf("limit=0 should be omitted: %s", path)
		}
	})
}
