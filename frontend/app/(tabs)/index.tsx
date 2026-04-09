import { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useJourneyStore } from '@/stores/journeyStore';
import { useAuthStore } from '@/stores/authStore';
import { JourneyCard } from '@/components/JourneyCard';
import type { Journey } from '@/types/journey';
import { Colors } from '@/constants/theme';

type TabType = 'nearby' | 'my-journeys';

export default function HomeScreen() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<TabType>('nearby');
  const [refreshing, setRefreshing] = useState(false);

  const { nearbyJourneys, journeys, loading, error, fetchNearbyJourneys, fetchUserJourneys } =
    useJourneyStore();
  const { user } = useAuthStore();

  // Mock location - in production this would come from expo-location
  const mockLocation = { lat: 55.6761, lng: 12.5683 }; // Copenhagen

  useEffect(() => {
    if (activeTab === 'nearby') {
      fetchNearbyJourneys(mockLocation.lat, mockLocation.lng);
    } else if (activeTab === 'my-journeys' && user?.id) {
      fetchUserJourneys(user.id);
    }
  }, [activeTab, user?.id]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      if (activeTab === 'nearby') {
        await fetchNearbyJourneys(mockLocation.lat, mockLocation.lng);
      } else if (activeTab === 'my-journeys' && user?.id) {
        await fetchUserJourneys(user.id);
      }
    } finally {
      setRefreshing(false);
    }
  }, [activeTab, user?.id]);

  const handleJourneyPress = (journeyId: string) => {
    router.push(`/journey/${journeyId}`);
  };

  const renderJourneyItem = ({ item }: { item: Journey }) => (
    <JourneyCard journey={item} onPress={handleJourneyPress} />
  );

  const renderEmptyState = (message: string) => (
    <View style={styles.emptyState}>
      <Ionicons name="map-outline" size={64} color="#ccc" />
      <Text style={styles.emptyText}>{message}</Text>
    </View>
  );

  const renderErrorState = () => (
    <View style={styles.errorState}>
      <Ionicons name="warning-outline" size={48} color="#E07A5F" />
      <Text style={styles.errorText}>{error || 'Something went wrong'}</Text>
      <TouchableOpacity style={styles.retryButton} onPress={onRefresh}>
        <Text style={styles.retryButtonText}>Retry</Text>
      </TouchableOpacity>
    </View>
  );

  const nearbyData = activeTab === 'nearby' ? nearbyJourneys : journeys;
  const emptyMessage =
    activeTab === 'nearby'
      ? 'No journeys nearby.\nBe the first to explore!'
      : 'You haven\'t created any journeys yet.\nStart your adventure!';

  return (
    <View style={styles.container}>
      {/* Tab Header */}
      <View style={styles.tabHeader}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'nearby' && styles.tabActive]}
          onPress={() => setActiveTab('nearby')}
        >
          <Ionicons
            name="location"
            size={18}
            color={activeTab === 'nearby' ? Colors.light.tint : '#999'}
          />
          <Text style={[styles.tabText, activeTab === 'nearby' && styles.tabTextActive]}>
            Nearby
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tab, activeTab === 'my-journeys' && styles.tabActive]}
          onPress={() => setActiveTab('my-journeys')}
        >
          <Ionicons
            name="person"
            size={18}
            color={activeTab === 'my-journeys' ? Colors.light.tint : '#999'}
          />
          <Text style={[styles.tabText, activeTab === 'my-journeys' && styles.tabTextActive]}>
            My Journeys
          </Text>
        </TouchableOpacity>
      </View>

      {/* Content */}
      {loading && !refreshing ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.light.tint} />
          <Text style={styles.loadingText}>Loading journeys...</Text>
        </View>
      ) : error ? (
        renderErrorState()
      ) : (
        <View style={styles.listWrapper}>
          <FlatList
            data={nearbyData}
            keyExtractor={(item) => item.id}
            renderItem={renderJourneyItem}
            contentContainerStyle={[
              styles.listContent,
              nearbyData.length === 0 && styles.listContentEmpty,
            ]}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                tintColor={Colors.light.tint}
              />
            }
            ListEmptyComponent={renderEmptyState(emptyMessage)}
            showsVerticalScrollIndicator={false}
          />
          {/* FAB — only shown on My Journeys tab */}
          {activeTab === 'my-journeys' && (
            <TouchableOpacity
              style={styles.fab}
              onPress={() => router.push('/journey/create')}
              data-testid="create-journey-fab"
            >
              <Ionicons name="add" size={26} color="#fff" />
            </TouchableOpacity>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FAFAF8',
  },
  tabHeader: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#EEE',
    paddingHorizontal: 16,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 14,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabActive: {
    borderBottomColor: Colors.light.tint,
  },
  tabText: {
    fontSize: 15,
    fontWeight: '500',
    color: '#999',
  },
  tabTextActive: {
    color: Colors.light.tint,
  },
  listWrapper: {
    flex: 1,
  },
  listContent: {
    padding: 16,
    paddingBottom: 80,
    flexGrow: 1,
  },
  listContentEmpty: {
    flexGrow: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
  },
  loadingText: {
    fontSize: 14,
    color: '#999',
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 80,
    gap: 16,
  },
  emptyText: {
    fontSize: 15,
    color: '#999',
    textAlign: 'center',
    lineHeight: 22,
  },
  errorState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 80,
    gap: 12,
  },
  errorText: {
    fontSize: 15,
    color: '#666',
    textAlign: 'center',
  },
  retryButton: {
    marginTop: 8,
    paddingHorizontal: 20,
    paddingVertical: 10,
    backgroundColor: Colors.light.tint,
    borderRadius: 8,
  },
  retryButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 14,
  },
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 20,
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: Colors.light.tint,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
});
