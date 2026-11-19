package internal

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"net/textproto"
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

// APIError is a non-2xx response from the server. It carries the status code so
// callers can distinguish a permission problem from a bad request without
// matching on the message; Error() renders exactly what it always has.
type APIError struct {
	StatusCode int
	Message    string
}

func (e *APIError) Error() string {
	return fmt.Sprintf("API error %d: %s", e.StatusCode, e.Message)
}

func (c *Client) do(method, path string, body io.Reader) (*http.Response, error) {
	contentType := ""
	if body != nil {
		contentType = "application/json"
	}
	return c.doWith(c.HTTPClient, method, path, body, contentType)
}

// transferTimeout bounds an upload or a download. The 30-second default suits a
// JSON call; a 10 MB attachment on a slow link can take longer than that.
const transferTimeout = 10 * time.Minute

func (c *Client) transferClient() *http.Client {
	hc := *c.HTTPClient
	hc.Timeout = transferTimeout
	return &hc
}

func (c *Client) doWith(hc *http.Client, method, path string, body io.Reader, contentType string) (*http.Response, error) {
	// Don't use url.JoinPath - it escapes query parameters
	u := c.BaseURL + path

	req, err := http.NewRequest(method, u, body)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+c.Token)
	if contentType != "" {
		req.Header.Set("Content-Type", contentType)
	}

	resp, err := hc.Do(req)
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
			return nil, &APIError{StatusCode: resp.StatusCode, Message: apiErr.Message}
		}
		return nil, &APIError{StatusCode: resp.StatusCode, Message: string(b)}
	}

	return resp, nil
}

// request sends payload (nil for none) as JSON and returns the raw response body.
func (c *Client) request(method, path string, payload any) (json.RawMessage, error) {
	body, err := jsonBody(payload)
	if err != nil {
		return nil, err
	}
	resp, err := c.do(method, path, body)
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

func (c *Client) Get(path string) (json.RawMessage, error) { return c.request("GET", path, nil) }

func (c *Client) Put(path string, payload any) (json.RawMessage, error) {
	return c.request("PUT", path, payload)
}

func (c *Client) Post(path string, payload any) (json.RawMessage, error) {
	return c.request("POST", path, payload)
}

func (c *Client) Delete(path string) (json.RawMessage, error) { return c.request("DELETE", path, nil) }

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

// PostFile uploads data as the multipart field `field`, named filename, and
// returns the response body. The body is built in memory so the request carries
// a Content-Length: the server refuses an oversized upload from that header
// before reading it, which a chunked body would not allow.
func (c *Client) PostFile(path, field, filename, contentType string, data []byte) (json.RawMessage, error) {
	var buf bytes.Buffer
	w := multipart.NewWriter(&buf)
	h := make(textproto.MIMEHeader)
	h.Set("Content-Disposition", fmt.Sprintf(`form-data; name="%s"; filename="%s"`, escapeQuotes(field), escapeQuotes(filename)))
	if contentType == "" {
		contentType = "application/octet-stream"
	}
	h.Set("Content-Type", contentType)
	part, err := w.CreatePart(h)
	if err != nil {
		return nil, err
	}
	if _, err := part.Write(data); err != nil {
		return nil, err
	}
	if err := w.Close(); err != nil {
		return nil, err
	}
	resp, err := c.doWith(c.transferClient(), "POST", path, bytes.NewReader(buf.Bytes()), w.FormDataContentType())
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

// Download streams the response body of path into dst and returns the byte count.
func (c *Client) Download(path string, dst io.Writer) (int64, error) {
	resp, err := c.doWith(c.transferClient(), "GET", path, nil, "")
	if err != nil {
		return 0, err
	}
	defer resp.Body.Close()
	return io.Copy(dst, resp.Body)
}

// escapeQuotes is mime/multipart's own escaping for a Content-Disposition value.
var quoteEscaper = strings.NewReplacer("\\", "\\\\", `"`, "\\\"")

func escapeQuotes(s string) string { return quoteEscaper.Replace(s) }
