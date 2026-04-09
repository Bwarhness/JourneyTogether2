import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { Link, router } from 'expo-router';
import { useAuthStore } from '../../src/stores/authStore';
import { Colors } from '../../constants/theme';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function RegisterScreen() {
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [validationError, setValidationError] = useState<string | null>(null);

  const { register, isLoading, error, clearError } = useAuthStore();

  const validateForm = (): boolean => {
    if (!email || !username || !password || !confirmPassword) {
      setValidationError('Please fill in all fields');
      return false;
    }

    if (!EMAIL_REGEX.test(email)) {
      setValidationError('Invalid email');
      return false;
    }

    if (password !== confirmPassword) {
      setValidationError('Passwords do not match');
      return false;
    }

    if (password.length < 8) {
      setValidationError('Password must be at least 8 characters');
      return false;
    }

    setValidationError(null);
    return true;
  };

  const handleRegister = async () => {
    clearError();
    
    if (!validateForm()) {
      return;
    }

    try {
      await register(email, username, password);
      // Navigate to home/dashboard on success
      router.replace('/(tabs)');
    } catch (err) {
      // Error is handled by the store
    }
  };

  return (
    <ScrollView style={styles.scrollContainer} contentContainerStyle={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Create Account</Text>
        <Text style={styles.subtitle}>Start your journey with us</Text>
      </View>

      {(validationError || error) && (
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>{validationError || error}</Text>
        </View>
      )}

      <View style={styles.form}>
        <View style={styles.inputContainer}>
          <Text style={styles.label}>Email</Text>
          <TextInput
            style={styles.input}
            testID="email-input"
            placeholder="Enter your email"
            placeholderTextColor="#9BA1A6"
            value={email}
            onChangeText={(text) => {
              setEmail(text);
              setValidationError(null);
              if (error) clearError();
            }}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
          />
        </View>

        <View style={styles.inputContainer}>
          <Text style={styles.label}>Username</Text>
          <TextInput
            style={styles.input}
            testID="username-input"
            placeholder="Choose a username"
            placeholderTextColor="#9BA1A6"
            value={username}
            onChangeText={(text) => {
              setUsername(text);
              setValidationError(null);
              if (error) clearError();
            }}
            autoCapitalize="none"
            autoCorrect={false}
          />
        </View>

        <View style={styles.inputContainer}>
          <Text style={styles.label}>Password</Text>
          <TextInput
            style={styles.input}
            testID="password-input"
            placeholder="Create a password"
            placeholderTextColor="#9BA1A6"
            value={password}
            onChangeText={(text) => {
              setPassword(text);
              setValidationError(null);
              if (error) clearError();
            }}
            secureTextEntry
          />
        </View>

        <View style={styles.inputContainer}>
          <Text style={styles.label}>Confirm Password</Text>
          <TextInput
            style={styles.input}
            testID="confirmPassword-input"
            placeholder="Confirm your password"
            placeholderTextColor="#9BA1A6"
            value={confirmPassword}
            onChangeText={(text) => {
              setConfirmPassword(text);
              setValidationError(null);
              if (error) clearError();
            }}
            secureTextEntry
          />
        </View>

        <TouchableOpacity
          style={[styles.button, isLoading && styles.buttonDisabled]}
          onPress={handleRegister}
          disabled={isLoading}
        >
          <Text style={styles.buttonText}>
            {isLoading ? 'Creating account...' : 'Sign Up'}
          </Text>
        </TouchableOpacity>
      </View>

      <View style={styles.footer}>
        <Text style={styles.footerText}>
          Already have an account?{' '}
        </Text>
        <Link href="/auth/login" style={styles.link}>
          <Text style={styles.linkText}>Log In</Text>
        </Link>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scrollContainer: {
    flex: 1,
    backgroundColor: Colors.dark.background,
  },
  container: {
    flexGrow: 1,
    padding: 24,
    justifyContent: 'center',
  },
  header: {
    marginBottom: 32,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: Colors.dark.text,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: Colors.dark.icon,
  },
  errorContainer: {
    backgroundColor: '#3D1C1C',
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
  },
  errorText: {
    color: '#FF6B6B',
    fontSize: 14,
  },
  form: {
    gap: 20,
  },
  inputContainer: {
    gap: 8,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.dark.text,
  },
  input: {
    backgroundColor: '#1E1E1E',
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    color: Colors.dark.text,
    borderWidth: 1,
    borderColor: '#2E2E2E',
  },
  button: {
    backgroundColor: Colors.dark.tint,
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 8,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 32,
  },
  footerText: {
    color: Colors.dark.icon,
    fontSize: 14,
  },
  link: {
    marginLeft: 4,
  },
  linkText: {
    color: Colors.dark.tint,
    fontSize: 14,
    fontWeight: '600',
  },
});
