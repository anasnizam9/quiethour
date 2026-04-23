import { LinearGradient } from 'expo-linear-gradient';
import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { QuietHourLogo } from '../components/Logo';
import { loginUser } from '../services/api';
import { colors } from '../theme';

type Props = {
  onLoginSuccess: (name: string, email: string, token: string) => void;
};

export function LoginScreen({ onLoginSuccess }: Props) {
  const [email, setEmail] = useState('student@quiethour.app');
  const [password, setPassword] = useState('quiet123');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleLogin = async () => {
    try {
      setLoading(true);
      setError('');
      const result = await loginUser(email.trim(), password);
      onLoginSuccess(result.user.name, result.user.email, result.token);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.page}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <LinearGradient colors={["#f9e5c9", "#f5efe7", "#f7f1e7"]} style={styles.hero}>
        <View style={styles.logoContainer}>
          <QuietHourLogo size={160} />
        </View>
      </LinearGradient>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Login</Text>

        <TextInput
          style={[styles.input, styles.firstInput]}
          placeholder="Email"
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
          placeholderTextColor="#75887f"
        />

        <TextInput
          style={styles.input}
          placeholder="Password"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          placeholderTextColor="#75887f"
        />

        {error ? <Text style={styles.errorText}>{error}</Text> : null}

        <Pressable style={styles.button} onPress={handleLogin} disabled={loading}>
          <Text style={styles.buttonText}>{loading ? 'Logging in...' : 'Continue'}</Text>
        </Pressable>

        <Text style={styles.demoHint}>Demo: student@quiethour.app / quiet123</Text>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: colors.pageBg,
    justifyContent: 'center',
    paddingHorizontal: 18,
  },
  hero: {
    borderRadius: 22,
    paddingVertical: 26,
    paddingHorizontal: 18,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#e4c79a',
    alignItems: 'center',
    shadowColor: '#b08b53',
    shadowOpacity: 0.18,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 3,
  },
  logoContainer: {
    marginBottom: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  card: {
    backgroundColor: colors.cardBg,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
  },
  cardTitle: {
    color: colors.ink,
    fontSize: 24,
    fontWeight: '800',
  },
  input: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#d7d9cd',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    color: colors.ink,
    marginBottom: 10,
  },
  firstInput: {
    marginTop: 12,
  },
  button: {
    marginTop: 4,
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: 'center',
  },
  buttonText: {
    color: '#ecfff7',
    fontSize: 16,
    fontWeight: '700',
  },
  demoHint: {
    marginTop: 10,
    color: colors.mutedInk,
    fontSize: 12,
  },
  errorText: {
    color: colors.warning,
    fontSize: 13,
    marginBottom: 6,
  },
});
