# Telegram call protocol work

`crypto.ts` implements the shared cryptographic layer, not a working call engine.
The production bridge still does not advertise voice/video availability.

The account Durable Object will own call setup, the ephemeral DH secret,
encrypted signalling, and the lease for the single operator answering/placing
the call. The owning browser will run WebRTC for microphone/camera media. Account
session credentials must remain inside the Durable Object.

Protocol references:

- [Telegram call key exchange and encryption](https://core.telegram.org/api/end-to-end/video-calls)
- [Telegram DH security checks](https://core.telegram.org/api/end-to-end#sending-a-request)
- [Current native version selection](https://github.com/TelegramMessenger/tgcalls/blob/ea5153e7184649feccf84d6735c9029ae9e78e8d/tgcalls/v2/InstanceV2Impl.cpp)
- [Packet counters and encryption](https://github.com/TelegramMessenger/tgcalls/blob/ea5153e7184649feccf84d6735c9029ae9e78e8d/tgcalls/EncryptedConnection.cpp)

The native reference maps library versions 8/9 to V2 signalling and 12/13 to V3.
V3 adds compression and a signalling transport such as SCTP. Ordinary browser SDP
JSON is not a compatible replacement for Telegram's structured channel negotiation.
Implement the selected format before advertising its library version. Do not
silently downgrade an incoming call with no supported version intersection.

Crypto tests run inside workerd. Their fixed DH and packet vectors were generated
independently using Python `pow`/`hashlib` and OpenSSL-backed `cryptography` AES-CTR.
Other tests cover the strict DH safety range, caller commitment, wrong direction,
tampering, concurrent duplicate packets, a bounded replay window and disposal.
These checks do not prove interoperability with a real Telegram client.
