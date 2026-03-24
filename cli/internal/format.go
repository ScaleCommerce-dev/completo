package internal

import (
	"encoding/json"
	"fmt"
	"strings"
)

type Field struct {
	Key   string
	Value string
}

func FormatFields(fields []Field, jsonOutput bool) string {
	if jsonOutput {
		m := make(map[string]string, len(fields))
		for _, f := range fields {
			m[f.Key] = f.Value
		}
		b, _ := json.MarshalIndent(m, "", "  ")
		return string(b)
	}

	var sb strings.Builder
	maxKey := 0
	for _, f := range fields {
		if len(f.Key) > maxKey {
			maxKey = len(f.Key)
		}
	}
	for _, f := range fields {
		if strings.Contains(f.Value, "\n") {
			// Multi-line values get their own block
			fmt.Fprintf(&sb, "%s:\n", f.Key)
			for _, line := range strings.Split(f.Value, "\n") {
				fmt.Fprintf(&sb, "  %s\n", line)
			}
		} else {
			fmt.Fprintf(&sb, "%-*s  %s\n", maxKey+1, f.Key+":", f.Value)
		}
	}
	return sb.String()
}

func FormatTable(headers []string, rows [][]string) string {
	widths := make([]int, len(headers))
	for i, h := range headers {
		widths[i] = len(h)
	}
	for _, row := range rows {
		for i, cell := range row {
			if i < len(widths) && len(cell) > widths[i] {
				widths[i] = len(cell)
			}
		}
	}

	var sb strings.Builder
	// Header
	for i, h := range headers {
		if i > 0 {
			sb.WriteString("  ")
		}
		fmt.Fprintf(&sb, "%-*s", widths[i], h)
	}
	sb.WriteString("\n")
	// Separator
	for i, w := range widths {
		if i > 0 {
			sb.WriteString("  ")
		}
		sb.WriteString(strings.Repeat("-", w))
	}
	sb.WriteString("\n")
	// Rows
	for _, row := range rows {
		for i, cell := range row {
			if i > 0 {
				sb.WriteString("  ")
			}
			if i < len(widths) {
				fmt.Fprintf(&sb, "%-*s", widths[i], cell)
			}
		}
		sb.WriteString("\n")
	}
	return sb.String()
}
