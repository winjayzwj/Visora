package server

import "net/http"

func NewHTTPServer(config Config, handler http.Handler) *http.Server {
	return &http.Server{
		Addr:              config.ListenAddr,
		Handler:           handler,
		ReadHeaderTimeout: config.RequestTimeout,
		ReadTimeout:       config.RequestTimeout,
		WriteTimeout:      config.RequestTimeout,
		IdleTimeout:       config.RequestTimeout,
	}
}
