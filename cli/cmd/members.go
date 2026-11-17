package cmd

import (
	"encoding/json"
	"fmt"
	"slices"
	"strings"

	"github.com/scalecommerce-dev/completo/cli/internal"
)

// member is one row of GET /api/projects/:id/members. An agent's email is null
// unless the agent is the caller, so agents are found by name or ID.
type member struct {
	ID    string  `json:"id"`
	Name  string  `json:"name"`
	Email *string `json:"email"`
	Kind  string  `json:"kind"`
}

func fetchMembers(client *internal.Client, projectID string) ([]member, error) {
	data, err := client.Get(fmt.Sprintf("/api/projects/%s/members", projectID))
	if err != nil {
		return nil, err
	}
	var members []member
	if err := json.Unmarshal(data, &members); err != nil {
		return nil, fmt.Errorf("failed to parse members: %w", err)
	}
	return members, nil
}

// resolveMember finds a project member by email, ID or name, the same rules the
// MCP tools use: email and name ignore case, an exact name wins over a
// case-insensitive one, and a name that matches more than one member is refused
// rather than guessed.
func resolveMember(members []member, ref string) (*member, error) {
	w := strings.TrimSpace(ref)
	for i, m := range members {
		if m.ID == w || (m.Email != nil && strings.EqualFold(*m.Email, w)) || m.Name == w {
			return &members[i], nil
		}
	}
	var loose []int
	for i, m := range members {
		if strings.EqualFold(m.Name, w) {
			loose = append(loose, i)
		}
	}
	if len(loose) == 1 {
		return &members[loose[0]], nil
	}
	names := make([]string, 0, len(members))
	for _, m := range members {
		label := m.Name
		if m.Email != nil {
			label += " <" + *m.Email + ">"
		} else if m.Kind == "agent" {
			label += " (agent)"
		}
		names = append(names, label)
	}
	if len(loose) > 1 {
		return nil, fmt.Errorf("%q matches more than one member; use the email or ID. Members: %s", ref, strings.Join(names, ", "))
	}
	return nil, fmt.Errorf("no project member %q. Members: %s", ref, strings.Join(names, ", "))
}

// validPriorities is what the server stores; a filter on anything else matches nothing.
var validPriorities = []string{"low", "medium", "high", "urgent"}

func requirePriority(p string) (string, error) {
	v := strings.ToLower(strings.TrimSpace(p))
	if slices.Contains(validPriorities, v) {
		return v, nil
	}
	return "", fmt.Errorf("priority %q is not one of %s", p, strings.Join(validPriorities, ", "))
}
