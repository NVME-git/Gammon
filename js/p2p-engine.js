/**
 * p2p-engine.js — Zero-backend peer-to-peer networking layer for Gammon.
 *
 * Uses PeerJS (loaded via CDN) as an abstraction over WebRTC.
 * The Host's browser acts as the source of truth: it rebroadcasts any state
 * received from a guest so every peer stays in sync.
 *
 * Message protocol (all JSON):
 *   { type: 'assign',  playerIndex: N, save: {...} }  Host → Guest   (game start / late join)
 *   { type: 'state',   save: {...} }                  Any  → All     (state sync after a move)
 *   { type: 'waiting' }                               Host → Guest   (game not started yet)
 *   { type: 'request_state' }                         Guest → Host   (catch-up request)
 */

export class NetworkManager {
  constructor() {
    /** @type {import('peerjs').Peer|null} */
    this.peer        = null;
    /** @type {import('peerjs').DataConnection[]} */
    this.connections = [];

    this.isHost            = false;
    this.isOnline          = false;
    this.roomId            = null;
    this.shareLink         = null;
    this.localPlayerIndex  = 0;   // Host = 0; Guests = 1, 2, 3

    /** Tracks the player index assigned to each connection (host only). */
    this._assignedIndices  = new Map();
    /** Counter for the next guest player index to assign (host only). */
    this._nextPlayerIndex  = 1;

    // ── Callbacks ───────────────────────────────────────────────────────────
    /** Called with (save) when a state-sync message is received. */
    this.onStateReceived     = null;
    /** Called with (playerIndex) once the host assigns this guest a seat. */
    this.onAssigned          = null;
    /** Called with (peerCount) whenever a connection opens or closes. */
    this.onConnectionChange  = null;
    /** Called when the host tells this guest to wait (game not started). */
    this.onWaiting           = null;
    /** Called by the host when a guest joins and needs state (getSave callback). */
    this.getSave             = null;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Public API
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Inspect the URL and decide whether to start as Host or Guest.
   * If ?room= is present the user is a guest and the connection is initiated
   * immediately.  Otherwise the caller must invoke startHosting() explicitly.
   */
  init() {
    const params    = new URLSearchParams(window.location.search);
    const roomParam = params.get('room');

    if (roomParam) {
      this.isHost   = false;
      this.isOnline = true;
      this.roomId   = roomParam;
      this._initPeer(() => this._connectToHost(roomParam));
    }
    // Host path: nothing to do until startHosting() is called.
  }

  /**
   * Start hosting a room.  Calls onReady(shareLink) once the PeerJS peer ID
   * is confirmed.  Safe to call only when there is no existing peer.
   * @param {(shareLink: string) => void} onReady
   */
  startHosting(onReady) {
    if (this.peer) return;
    this.isHost           = true;
    this.isOnline         = true;
    this.localPlayerIndex = 0;

    this._initPeer((id) => {
      this.roomId    = id;
      // Build share link from current page origin + path, strip any existing ?room=
      const url      = new URL(window.location.href);
      url.search     = '';
      url.searchParams.set('room', id);
      this.shareLink = url.toString();
      onReady(this.shareLink);
    });

    this.peer.on('connection', (conn) => {
      this._setupConnection(conn);
      this.connections.push(conn);
    });
  }

  /**
   * Broadcast the complete game state to all connected peers.
   * Should be called after every roll / move by the local player.
   * @param {object} save  Return value of game.exportSave()
   */
  syncState(save) {
    this._broadcast({ type: 'state', save });
  }

  /**
   * Convenience alias used in main.js after every local action.
   * @param {object} save  Return value of game.exportSave()
   */
  handleMove(save) {
    this.syncState(save);
  }

  /**
   * Send full state + player assignment to a single guest connection.
   * Called by the host when starting a game or when a guest connects late.
   * @param {import('peerjs').DataConnection} conn
   * @param {number} playerIndex
   * @param {object} save
   */
  assignGuest(conn, playerIndex, save) {
    this._send(conn, { type: 'assign', playerIndex, save });
  }

  /**
   * Entry point for all inbound data.
   * PeerJS may deliver pre-parsed objects or raw JSON strings.
   * @param {string|object} rawData
   * @param {import('peerjs').DataConnection} fromConn
   */
  onDataReceived(rawData, fromConn) {
    let data;
    try {
      data = (typeof rawData === 'string') ? JSON.parse(rawData) : rawData;
    } catch {
      console.warn('[P2P] Could not parse incoming message', rawData);
      return;
    }

    switch (data.type) {
      case 'state': {
        if (this.onStateReceived) this.onStateReceived(data.save);
        // Host rebroadcasts to all other peers (source-of-truth enforcement).
        if (this.isHost) {
          this._broadcast({ type: 'state', save: data.save }, fromConn);
        }
        break;
      }
      case 'assign': {
        // Guests receive their seat assignment from the host.
        this.localPlayerIndex = data.playerIndex;
        if (this.onAssigned)       this.onAssigned(data.playerIndex, data.save);
        break;
      }
      case 'waiting': {
        if (this.onWaiting) this.onWaiting();
        break;
      }
      case 'request_state': {
        // A guest is asking the host for the current state (e.g. refresh / late join).
        if (this.isHost && this.getSave) {
          const save = this.getSave();
          // Use the stable index already assigned for this connection, falling
          // back to a fresh index only if this connection hasn't been seen yet.
          let idx = this._assignedIndices.get(fromConn);
          if (idx === undefined) {
            idx = this._nextPlayerIndex++;
            this._assignedIndices.set(fromConn, idx);
          }
          if (save) this.assignGuest(fromConn, idx, save);
        }
        break;
      }
      default:
        console.warn('[P2P] Unknown message type:', data.type);
    }
  }

  /** Cleanly close all connections and destroy the peer. */
  disconnect() {
    for (const conn of this.connections) conn.close();
    this.connections      = [];
    this._assignedIndices = new Map();
    this._nextPlayerIndex = 1;
    if (this.peer) {
      this.peer.destroy();
      this.peer = null;
    }
    this.isOnline = false;
    this.roomId   = null;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Private helpers
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Create a new PeerJS Peer and wait for it to open.
   * @param {(id: string) => void} onOpen
   */
  _initPeer(onOpen) {
    this.peer = new Peer();   // uses PeerJS free public STUN/TURN cloud

    this.peer.on('open',  onOpen);
    this.peer.on('error', (err) => {
      console.error('[P2P] Peer error:', err.type, err.message || err);
    });
    this.peer.on('disconnected', () => {
      // Attempt one automatic reconnect before giving up.
      this.peer.reconnect();
    });
  }

  /** Connect to a host room as a guest. */
  _connectToHost(hostId) {
    const conn = this.peer.connect(hostId, { reliable: true });
    this.connections.push(conn);
    this._setupConnection(conn);
  }

  /**
   * Attach data / lifecycle listeners to a DataConnection.
   * @param {import('peerjs').DataConnection} conn
   */
  _setupConnection(conn) {
    conn.on('open', () => {
      if (this.onConnectionChange) {
        this.onConnectionChange(this.connections.length);
      }

      if (!this.isHost) {
        // Guest: ask for the current state immediately in case the game is
        // already in progress.
        this._send(conn, { type: 'request_state' });
      } else {
        // Host: assign a stable player index to this connection.
        const playerIndex = this._nextPlayerIndex++;
        this._assignedIndices.set(conn, playerIndex);

        // If a game is already running, assign this guest a seat.
        if (this.getSave) {
          const save = this.getSave();
          if (save) {
            this.assignGuest(conn, playerIndex, save);
          } else {
            this._send(conn, { type: 'waiting' });
          }
        } else {
          this._send(conn, { type: 'waiting' });
        }
      }
    });

    conn.on('data', (raw) => this.onDataReceived(raw, conn));

    conn.on('close', () => {
      this._assignedIndices.delete(conn);
      this.connections = this.connections.filter(c => c !== conn);
      if (this.onConnectionChange) {
        this.onConnectionChange(this.connections.length);
      }
    });

    conn.on('error', (err) => {
      console.error('[P2P] Connection error:', err);
    });
  }

  /**
   * Serialise and send a message to one connection.
   * @param {import('peerjs').DataConnection} conn
   * @param {object} msg
   */
  _send(conn, msg) {
    if (conn.open) conn.send(JSON.stringify(msg));
  }

  /**
   * Serialise and send to all open connections, optionally excluding one.
   * @param {object} msg
   * @param {import('peerjs').DataConnection|null} [exclude]
   */
  _broadcast(msg, exclude = null) {
    const str = JSON.stringify(msg);
    for (const conn of this.connections) {
      if (conn !== exclude && conn.open) conn.send(str);
    }
  }
}

/** Singleton instance used across the app. */
export const network = new NetworkManager();
