"use client";

import { Shield, ShieldOff, Activity, Eye, EyeOff } from "lucide-react";
import { useState } from "react";
import { Switch } from "@/components/ui/switch";

interface HPOStatusPanelProps {
  coverReceived: number;
  realReceived: number;
  hpoEnabled: boolean;
  onToggleHPO: (enabled: boolean) => void;
}

export function HPOStatusPanel({
  coverReceived,
  realReceived,
  hpoEnabled,
  onToggleHPO,
}: HPOStatusPanelProps) {
  const [expanded, setExpanded] = useState(false);

  const totalPackets = coverReceived + realReceived;
  const coverRatio =
    totalPackets > 0 ? ((coverReceived / totalPackets) * 100).toFixed(1) : "0";

  return (
    <div className="border-t bg-muted/20">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-4 py-1.5 text-xs text-muted-foreground hover:bg-muted/40 transition-colors"
      >
        <div className="flex items-center gap-2">
          {hpoEnabled ? (
            <Shield className="h-3 w-3 text-green-500" />
          ) : (
            <ShieldOff className="h-3 w-3 text-red-500" />
          )}
          <span>
            HPO Metadata Obfuscation {hpoEnabled ? "Active" : "Disabled"}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1">
            <Activity className="h-3 w-3" />
            {totalPackets} packets
          </span>
          {expanded ? (
            <EyeOff className="h-3 w-3" />
          ) : (
            <Eye className="h-3 w-3" />
          )}
        </div>
      </button>
      {expanded && (
        <div className="px-4 py-2 space-y-3 text-xs border-t">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground font-medium">
              HPO Protection
            </span>
            <div className="flex items-center gap-2">
              <span className={hpoEnabled ? "text-green-600" : "text-red-500"}>
                {hpoEnabled ? "ON" : "OFF"}
              </span>
              <Switch
                checked={hpoEnabled}
                onCheckedChange={onToggleHPO}
                className="scale-75"
              />
            </div>
          </div>
          <div className="grid grid-cols-4 gap-4">
            <div>
              <p className="text-muted-foreground">Cover Packets</p>
              <p className="font-mono font-medium text-orange-500">
                {coverReceived}
              </p>
            </div>
            <div>
              <p className="text-muted-foreground">Real Packets</p>
              <p className="font-mono font-medium text-green-500">
                {realReceived}
              </p>
            </div>
            <div>
              <p className="text-muted-foreground">Cover Ratio</p>
              <p className="font-mono font-medium">{coverRatio}%</p>
            </div>
            <div>
              <p className="text-muted-foreground">CRT Interval</p>
              <p className="font-mono font-medium">500ms</p>
            </div>
          </div>
          <div className="text-muted-foreground bg-muted/30 rounded p-2">
            {hpoEnabled ? (
              <p>
                All packets are padded to uniform sizes (1KB/2KB/4KB) and sent
                at a constant rate. Cover traffic fills idle periods making real
                messages indistinguishable from noise.
              </p>
            ) : (
              <p>
                HPO is disabled. Messages are sent directly without padding or
                cover traffic. Packet sizes and timing patterns may reveal
                communication metadata to network observers.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
