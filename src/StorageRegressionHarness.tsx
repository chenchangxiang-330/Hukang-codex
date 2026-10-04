import React, { useEffect, useRef, useState } from "react";
import { ActivityIndicator, ScrollView, Text } from "react-native";
import { File, Paths } from "expo-file-system";
import { runStorageRegression } from "./storageRegression";
import { validateStorageRegressionRequest, type StorageRegressionPhase } from "./storageRegressionAssertions";
import { buildInfo } from "./buildInfo";

// MainActivity/App must expose this only for a guarded cloud Debug intent.
export default function StorageRegressionHarness({ phase, runId }: { phase: StorageRegressionPhase; runId: string }) {
  const started = useRef(false), [status, setStatus] = useState("正在执行本机数据回归…"), [done, setDone] = useState(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const run = async () => {
      validateStorageRegressionRequest(phase, runId);
      const output = new File(Paths.document, `storage-regression-${phase}.json`);
      const pending = new File(Paths.document, `storage-regression-${phase}.pending.json`);
      if (output.exists) output.delete();
      try {
        const result = await runStorageRegression(phase, runId, setStatus);
        pending.write(JSON.stringify({ ...result, buildInfo, completedAt: new Date().toISOString(), documentDirectory: Paths.document.uri }, null, 2));
        await pending.move(output, { overwrite: true });
        setStatus(`数据回归 ${phase} 完成：${output.uri}`);
      } catch (error) {
        pending.write(JSON.stringify({ schemaVersion: 1, status: "error", phase, runId, buildInfo, error: error instanceof Error ? error.message : String(error), completedAt: new Date().toISOString(), documentDirectory: Paths.document.uri }, null, 2));
        await pending.move(output, { overwrite: true });
        setStatus("数据回归未完成，错误已写入执行记录。");
      } finally { setDone(true); }
    };
    void run().catch(error => { setStatus(`执行记录无法保存：${String(error)}`); setDone(true); });
  }, [phase, runId]);
  return <ScrollView contentContainerStyle={{ padding: 24, paddingTop: 48, gap: 12 }}>
    <Text>HuKang · 本机数据持久化回归</Text>{!done && <ActivityIndicator />}
    <Text selectable>{status}</Text><Text>仅使用生产存储接口。写入后须由云脚本杀进程、断网，再启动 verify 阶段。</Text>
  </ScrollView>;
}
