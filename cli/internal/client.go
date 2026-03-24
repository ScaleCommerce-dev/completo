package internal

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

type Client struct {
	BaseURL    string
	Token      string
	HTTPClient *http.Client
}

func NewClient(cfg *Config) (*Client, error) {
	if err := cfg.Validate(); err != nil {
		return nil, err
	}
	baseURL := strings.TrimRight(cfg.URL, "/")
	return &Client{
		BaseURL: baseURL,
		Token:   cfg.Token,
		HTTPClient: &http.Client{
			Timeout: 30 * time.Second,
		},
	}, nil
}

func (c *Client) do(method, path string, body io.Reader) (*http.Response, error) {
	// Don't use url.JoinPath - it escapes query parameters
	u := c.BaseURL + path

	req, err := http.NewRequest(method, u, body)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+c.Token)
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}

	resp, err := c.HTTPClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("request failed: %w", err)
	}

	if resp.StatusCode >= 400 {
		defer resp.Body.Close()
		b, _ := io.ReadAll(resp.Body)
		// Try to extract just the message from JSON error responses
		var apiErr struct {
			Message string `json:"message"`
		}
		if json.Unmarshal(b, &apiErr) == nil && apiErr.Message != "" {
			return nil, fmt.Errorf("API error %d: %s", resp.StatusCode, apiErr.Message)
		}
		return nil, fmt.Errorf("API error %d: %s", resp.StatusCode, string(b))
	}

	return resp, nil
}

func (c *Client) Get(path string) (json.RawMessage, error) {
	resp, err := c.do("GET", path, nil)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	b, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}
	return json.RawMessage(b), nil
}

func (c *Client) Put(path string, payload any) (json.RawMessage, error) {
	body, err := jsonBody(payload)
	if err != nil {
		return nil, err
	}
	resp, err := c.do("PUT", path, body)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	b, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}
	return json.RawMessage(b), nil
}

func (c *Client) Post(path string, payload any) (json.RawMessage, error) {
	body, err := jsonBody(payload)
	if err != nil {
		return nil, err
	}
	resp, err := c.do("POST", path, body)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	b, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}
	return json.RawMessage(b), nil
}

func jsonBody(payload any) (io.Reader, error) {
	if payload == nil {
		return nil, nil
	}
	b, err := json.Marshal(payload)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal payload: %w", err)
	}
	return bytes.NewReader(b), nil
}
