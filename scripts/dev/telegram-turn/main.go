// Local-only TURN fixture for synthetic browser media qualification.
// Both listeners, every allocation, and every permitted peer use loopback.
package main

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"log"
	"net"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/pion/logging"
	"github.com/pion/turn/v4"
)

func main() {
	udp, err := net.ListenPacket("udp4", "127.0.0.1:0")
	if err != nil {
		log.Fatal(err)
	}
	defer udp.Close()
	tcp, err := net.Listen("tcp4", "127.0.0.1:0")
	if err != nil {
		log.Fatal(err)
	}
	defer tcp.Close()

	var random [32]byte
	if _, err := rand.Read(random[:]); err != nil {
		log.Fatal(err)
	}
	username, password, realm := "synthetic", hex.EncodeToString(random[:]), "hype-test.invalid"
	key := turn.GenerateAuthKey(username, realm, password)
	loopback := func(address net.Addr, peer net.IP) bool {
		host, _, err := net.SplitHostPort(address.String())
		return err == nil && net.ParseIP(host).IsLoopback() && peer.IsLoopback()
	}
	generator := &turn.RelayAddressGeneratorStatic{RelayAddress: net.ParseIP("127.0.0.1"), Address: "127.0.0.1"}
	logger := logging.NewDefaultLoggerFactory()
	logger.Writer = os.Stderr
	server, err := turn.NewServer(turn.ServerConfig{
		Realm:         realm,
		LoggerFactory: logger,
		AuthHandler: func(user, requestedRealm string, address net.Addr) ([]byte, bool) {
			return key, user == username && requestedRealm == realm && loopback(address, net.ParseIP("127.0.0.1"))
		},
		PacketConnConfigs: []turn.PacketConnConfig{{PacketConn: udp, RelayAddressGenerator: generator, PermissionHandler: loopback}},
		ListenerConfigs:   []turn.ListenerConfig{{Listener: tcp, RelayAddressGenerator: generator, PermissionHandler: loopback}},
	})
	if err != nil {
		log.Fatal(err)
	}
	defer server.Close()
	// Only the parent test runner consumes these ephemeral credentials from stdout.
	if err := json.NewEncoder(os.Stdout).Encode(map[string]any{
		"udpPort": udp.LocalAddr().(*net.UDPAddr).Port, "tcpPort": tcp.Addr().(*net.TCPAddr).Port,
		"username": username, "credential": password,
	}); err != nil {
		log.Fatal(err)
	}
	signals := make(chan os.Signal, 1)
	signal.Notify(signals, syscall.SIGINT, syscall.SIGTERM)
	defer signal.Stop(signals)
	select {
	case <-signals:
	case <-time.After(2 * time.Minute):
	}
}
