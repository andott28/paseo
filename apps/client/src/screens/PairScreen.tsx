import { useState, type JSX } from "react";
import { ActivityIndicator, Image, Pressable, SafeAreaView, Text, TextInput, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import { s } from "../styles";

export function PairScreen(props: {
  brandLogo: number;
  pairInput: string;
  setPairInput(v: string): void;
  localDaemonBase: string;
  setLocalDaemonBase(v: string): void;
  clientName: string;
  setClientName(v: string): void;
  isPairing: boolean;
  desktopDaemonBase: string | null;
  mobileHostInput: string;
  setMobileHostInput(v: string): void;
  mobilePairBusy: boolean;
  mobilePairQr: string | null;
  mobilePairUrl: string | null;
  pair(): Promise<void>;
  pairLocal(): Promise<void>;
  createMobilePairingQr(): Promise<void>;
  connectionError: string | null;
}): JSX.Element {
  const [showTokenPairing, setShowTokenPairing] = useState(false);
  const [showMobilePairing, setShowMobilePairing] = useState(false);

  return (
    <SafeAreaView style={s.container} className="flex-1 items-center">
      <StatusBar style="light" />
      <View style={s.brand} className="w-full max-w-3xl px-4">
        <Image source={props.brandLogo} style={s.logo} />
        <Text style={s.brandTitle}>GAA</Text>
      </View>
      <View style={s.card} className="w-full max-w-3xl">
        <Text style={s.cardTitle}>Connect to local daemon</Text>
        <Text style={s.cardSub}>Desktop use does not require mobile. Connect to the bundled local daemon and continue.</Text>
        {props.desktopDaemonBase ? <Text style={s.sectionTitle}>Desktop daemon detected</Text> : null}
        <TextInput
          value={props.localDaemonBase}
          onChangeText={props.setLocalDaemonBase}
          placeholder="http://127.0.0.1:9777"
          placeholderTextColor="#64748b"
          style={s.input}
          autoCapitalize="none"
          autoCorrect={false}
        />
        <TextInput value={props.clientName} onChangeText={props.setClientName} placeholder="Desktop client name" placeholderTextColor="#64748b" style={s.input} />
        <Pressable style={[s.btn, props.isPairing && s.btnDisabled]} onPress={() => void props.pairLocal()} disabled={props.isPairing}>
          {props.isPairing ? <ActivityIndicator color="#0a0a0f" /> : <Text style={s.btnText}>Connect Desktop</Text>}
        </Pressable>
        <View style={s.actionRow}>
          <Pressable style={s.btnGhost} onPress={() => setShowTokenPairing((current) => !current)}>
            <Text style={s.ghostBtnText}>{showTokenPairing ? "Hide Token Pairing" : "Use Pairing Token"}</Text>
          </Pressable>
          {props.desktopDaemonBase ? (
            <Pressable style={s.btnGhost} onPress={() => setShowMobilePairing((current) => !current)}>
              <Text style={s.ghostBtnText}>{showMobilePairing ? "Hide Mobile Pairing" : "Use Phone Instead"}</Text>
            </Pressable>
          ) : null}
        </View>
        {showTokenPairing ? (
          <>
            <Text style={s.sectionTitle}>Manual token pairing</Text>
            <Text style={s.cardSub}>Use this only when connecting through an external pairing link.</Text>
            <TextInput value={props.pairInput} onChangeText={props.setPairInput} placeholder="Paste pairing URL..." placeholderTextColor="#64748b" style={s.input} multiline />
            <Pressable style={[s.btn, props.isPairing && s.btnDisabled]} onPress={() => void props.pair()} disabled={props.isPairing}>
              {props.isPairing ? <ActivityIndicator color="#0a0a0f" /> : <Text style={s.btnText}>Connect With Token</Text>}
            </Pressable>
          </>
        ) : null}
        {props.desktopDaemonBase && showMobilePairing ? (
          <>
            <Text style={s.sectionTitle}>Mobile pairing</Text>
            <Text style={s.cardSub}>Optional. Generate a QR only if you want a phone to join this local daemon.</Text>
            <TextInput
              value={props.mobileHostInput}
              onChangeText={props.setMobileHostInput}
              placeholder="LAN IP:port for phone access"
              placeholderTextColor="#64748b"
              style={s.input}
            />
            <Pressable style={[s.btn, props.mobilePairBusy && s.btnDisabled]} onPress={() => void props.createMobilePairingQr()} disabled={props.mobilePairBusy}>
              {props.mobilePairBusy ? <ActivityIndicator color="#0a0a0f" /> : <Text style={s.btnText}>Generate QR</Text>}
            </Pressable>
            {props.mobilePairQr ? <Image source={{ uri: props.mobilePairQr }} style={s.qrImage} /> : null}
            {props.mobilePairUrl ? <Text style={s.qrUrl}>{props.mobilePairUrl}</Text> : null}
          </>
        ) : null}
      </View>
      {props.connectionError ? <Text style={s.error}>{props.connectionError}</Text> : null}
    </SafeAreaView>
  );
}
