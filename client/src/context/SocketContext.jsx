import { useEffect, useState } from "react";
import { io } from "socket.io-client";
import { useAuth } from "@/context/AuthContext";
import { SocketContext } from "@/context/socketContext";

export function SocketProvider({ children }) {
  const { isAuthenticated, isLoading, mustChangePassword, user } = useAuth();
  const [socket, setSocket] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const [connectionError, setConnectionError] = useState("");
  const identity = user?._id || user?.id || "";

  useEffect(() => {
    if (isLoading || !isAuthenticated || mustChangePassword || !identity) {
      setSocket(null);
      setIsConnected(false);
      setConnectionError("");
      return undefined;
    }

    const connection = io(window.location.origin, {
      autoConnect: false,
      withCredentials: true,
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 500,
      reconnectionDelayMax: 10_000,
      timeout: 10_000,
    });
    const handleConnect = () => {
      setIsConnected(true);
      setConnectionError("");
    };
    const handleDisconnect = () => setIsConnected(false);
    const handleConnectError = (error) => {
      setConnectionError(
        error.data?.code === "SOCKET_UNAUTHORIZED"
          ? "The current session is not authorized for realtime updates."
          : "Realtime updates are temporarily unavailable."
      );
      if (error.data?.code === "SOCKET_UNAUTHORIZED") connection.disconnect();
    };
    connection.on("connect", handleConnect);
    connection.on("disconnect", handleDisconnect);
    connection.on("connect_error", handleConnectError);
    setSocket(connection);
    connection.connect();

    return () => {
      connection.off("connect", handleConnect);
      connection.off("disconnect", handleDisconnect);
      connection.off("connect_error", handleConnectError);
      connection.disconnect();
      setIsConnected(false);
      setSocket((current) => (current === connection ? null : current));
    };
  }, [identity, isAuthenticated, isLoading, mustChangePassword]);

  return (
    <SocketContext.Provider value={{ socket, isConnected, connectionError }}>
      {children}
    </SocketContext.Provider>
  );
}
