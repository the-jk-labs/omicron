package org.omicron.mobile

import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import androidx.navigation.toRoute
import kotlinx.serialization.Serializable
import org.omicron.mobile.core.designsystem.OmicronTheme
import org.omicron.mobile.core.storage.AppearancePreferenceStore
import org.omicron.mobile.data.repository.AuthoringRepository
import org.omicron.mobile.data.repository.AuthRepository
import org.omicron.mobile.data.repository.DiscoveryRepository
import org.omicron.mobile.data.repository.InstanceRepository
import org.omicron.mobile.data.repository.PostsRepository
import org.omicron.mobile.data.repository.SocialRepository
import org.omicron.mobile.feature.auth.AuthRoute
import org.omicron.mobile.feature.auth.AuthViewModel
import org.omicron.mobile.feature.composer.ComposerRoute
import org.omicron.mobile.feature.composer.ComposerViewModel
import org.omicron.mobile.feature.connect.ConnectRoute
import org.omicron.mobile.feature.connect.ConnectViewModel
import org.omicron.mobile.feature.discovery.DiscoverRoute
import org.omicron.mobile.feature.discovery.DiscoverViewModel
import org.omicron.mobile.feature.discovery.SearchRoute
import org.omicron.mobile.feature.discovery.SearchViewModel
import org.omicron.mobile.feature.discovery.TagRoute
import org.omicron.mobile.feature.discovery.TagViewModel
import org.omicron.mobile.feature.manage.ManageRoute
import org.omicron.mobile.feature.manage.ManageViewModel
import org.omicron.mobile.feature.offline.OfflineReadingRoute
import org.omicron.mobile.feature.offline.OfflineReadingViewModel
import org.omicron.mobile.feature.reader.PostDetailRoute
import org.omicron.mobile.feature.reader.PostDetailViewModel
import org.omicron.mobile.feature.reader.PostSocialViewModel
import org.omicron.mobile.feature.reader.TimelineRoute
import org.omicron.mobile.feature.reader.TimelineViewModel
import org.omicron.mobile.feature.profile.ProfileRoute
import org.omicron.mobile.feature.profile.ProfileViewModel
import org.omicron.mobile.feature.settings.SettingsRoute
import org.omicron.mobile.feature.settings.SettingsViewModel

@Composable
fun OmicronApp(
    instanceRepository: InstanceRepository,
    authRepository: AuthRepository,
    postsRepository: PostsRepository,
    socialRepository: SocialRepository,
    discoveryRepository: DiscoveryRepository,
    authoringRepository: AuthoringRepository,
    appearancePreferenceStore: AppearancePreferenceStore,
    onDarkThemeChanged: ((Boolean) -> Unit)? = null,
) {
    val settingsViewModel =
        remember(instanceRepository, authRepository, appearancePreferenceStore) {
            SettingsViewModel(instanceRepository::savedInstance, authRepository, appearancePreferenceStore)
        }
    DisposableEffect(settingsViewModel) {
        onDispose(settingsViewModel::close)
    }
    val settingsState by settingsViewModel.uiState.collectAsState()
    OmicronTheme(
        appearance = settingsState.appearance,
        onDarkThemeChanged = onDarkThemeChanged,
    ) {
        val navController = rememberNavController()
        NavHost(navController = navController, startDestination = ConnectDestination) {
            composable<ConnectDestination> {
                val viewModel = remember(instanceRepository) { ConnectViewModel(instanceRepository) }
                DisposableEffect(viewModel) {
                    onDispose(viewModel::close)
                }
                ConnectRoute(
                    viewModel = viewModel,
                    onContinue = { navController.navigate(TimelineDestination) { launchSingleTop = true } },
                )
            }
            composable<TimelineDestination> {
                val viewModel =
                    remember(postsRepository, authRepository) {
                        TimelineViewModel(postsRepository, session = authRepository.session, sessionExpired = authRepository.sessionExpired)
                    }
                DisposableEffect(viewModel) {
                    onDispose(viewModel::close)
                }
                TimelineRoute(
                    viewModel = viewModel,
                    onSignIn = { navController.navigate(AuthDestination) { launchSingleTop = true } },
                    onChangeInstance = { navController.popBackStack(ConnectDestination, false) },
                    onOpenPost = { postId -> navController.navigate(PostDestination(postId)) },
                    onOpenProfile = { username -> navController.navigate(ProfileDestination(username)) },
                    onOpenSearch = { navController.navigate(SearchDestination) },
                    onOpenDiscover = { navController.navigate(DiscoverDestination) },
                    onOpenComposer = { navController.navigate(ComposeDestination()) },
                    onOpenSettings = { navController.navigate(SettingsDestination) { launchSingleTop = true } },
                )
            }
            composable<ComposeDestination> { backStackEntry ->
                val destination = backStackEntry.toRoute<ComposeDestination>()
                val viewModel =
                    remember(authoringRepository, postsRepository, destination.postId) {
                        ComposerViewModel(authoringRepository, postsRepository, destination.postId)
                    }
                DisposableEffect(viewModel) {
                    onDispose(viewModel::close)
                }
                ComposerRoute(
                    viewModel = viewModel,
                    onBack = { navController.popBackStack() },
                    onSignIn = { navController.navigate(AuthDestination) { launchSingleTop = true } },
                    onPublished = { postId -> navController.navigate(PostDestination(postId)) },
                )
            }
            composable<ManageDestination> {
                val viewModel =
                    remember(authoringRepository, authRepository) {
                        ManageViewModel(authoringRepository, sessionExpired = authRepository.sessionExpired)
                    }
                DisposableEffect(viewModel) {
                    onDispose(viewModel::close)
                }
                ManageRoute(
                    viewModel = viewModel,
                    onBack = { navController.popBackStack() },
                    onSignIn = { navController.navigate(AuthDestination) { launchSingleTop = true } },
                    onEdit = { postId -> navController.navigate(ComposeDestination(postId)) },
                    onView = { postId -> navController.navigate(PostDestination(postId)) },
                )
            }
            composable<SettingsDestination> {
                SettingsRoute(
                    viewModel = settingsViewModel,
                    onBack = { navController.popBackStack() },
                    onChangeInstance = { navController.popBackStack(ConnectDestination, false) },
                    onSignIn = { navController.navigate(AuthDestination) { launchSingleTop = true } },
                    onOpenOfflineReading = { navController.navigate(OfflineReadingDestination) },
                )
            }
            composable<OfflineReadingDestination> {
                val viewModel = remember(postsRepository) { OfflineReadingViewModel(postsRepository) }
                DisposableEffect(viewModel) {
                    onDispose(viewModel::close)
                }
                OfflineReadingRoute(
                    viewModel = viewModel,
                    onBack = { navController.popBackStack() },
                    onOpenPost = { postId -> navController.navigate(PostDestination(postId)) },
                )
            }
            composable<SearchDestination> {
                val viewModel =
                    remember(discoveryRepository) {
                        SearchViewModel(discoveryRepository)
                    }
                DisposableEffect(viewModel) {
                    onDispose(viewModel::close)
                }
                SearchRoute(
                    viewModel = viewModel,
                    onBack = { navController.popBackStack() },
                    onOpenDiscover = { navController.navigate(DiscoverDestination) { launchSingleTop = true } },
                    onOpenPost = { postId -> navController.navigate(PostDestination(postId)) },
                    onOpenProfile = { username -> navController.navigate(ProfileDestination(username)) },
                    onOpenTag = { slug -> navController.navigate(TagDestination(slug)) },
                )
            }
            composable<DiscoverDestination> {
                val viewModel =
                    remember(discoveryRepository) {
                        DiscoverViewModel(discoveryRepository)
                    }
                DisposableEffect(viewModel) {
                    onDispose(viewModel::close)
                }
                DiscoverRoute(
                    viewModel = viewModel,
                    onBack = { navController.popBackStack() },
                    onOpenSearch = { navController.navigate(SearchDestination) { launchSingleTop = true } },
                    onOpenPost = { postId -> navController.navigate(PostDestination(postId)) },
                    onOpenProfile = { username -> navController.navigate(ProfileDestination(username)) },
                    onOpenTag = { slug -> navController.navigate(TagDestination(slug)) },
                )
            }
            composable<TagDestination> { backStackEntry ->
                val destination = backStackEntry.toRoute<TagDestination>()
                val viewModel =
                    remember(discoveryRepository, destination.slug) {
                        TagViewModel(
                            discoveryRepository,
                            destination.slug,
                            session = authRepository.session,
                        )
                    }
                DisposableEffect(viewModel) {
                    onDispose(viewModel::close)
                }
                TagRoute(
                    viewModel = viewModel,
                    onBack = { navController.popBackStack() },
                    onSignIn = { navController.navigate(AuthDestination) { launchSingleTop = true } },
                    onOpenPost = { postId -> navController.navigate(PostDestination(postId)) },
                )
            }
            composable<PostDestination> { backStackEntry ->
                val destination = backStackEntry.toRoute<PostDestination>()
                val viewModel =
                    remember(postsRepository, destination.postId) {
                        PostDetailViewModel(postsRepository, destination.postId)
                    }
                val socialViewModel =
                    remember(socialRepository, destination.postId, authRepository) {
                        PostSocialViewModel(
                            socialRepository,
                            destination.postId,
                            session = authRepository.session,
                            sessionExpired = authRepository.sessionExpired,
                        )
                    }
                DisposableEffect(viewModel, socialViewModel) {
                    onDispose {
                        viewModel.close()
                        socialViewModel.close()
                    }
                }
                PostDetailRoute(
                    viewModel = viewModel,
                    socialViewModel = socialViewModel,
                    onBack = { navController.popBackStack() },
                    onOpenPost = { postId -> navController.navigate(PostDestination(postId)) },
                    onChangeInstance = { navController.popBackStack(ConnectDestination, false) },
                    onSignIn = { navController.navigate(AuthDestination) { launchSingleTop = true } },
                    onOpenProfile = { username -> navController.navigate(ProfileDestination(username)) },
                )
            }
            composable<ProfileDestination> { backStackEntry ->
                val destination = backStackEntry.toRoute<ProfileDestination>()
                val remote = destination.username.contains('@')
                val viewModel =
                    remember(socialRepository, destination.username, remote, authRepository) {
                        ProfileViewModel(
                            socialRepository,
                            destination.username,
                            remote,
                            session = authRepository.session,
                            sessionExpired = authRepository.sessionExpired,
                        )
                    }
                DisposableEffect(viewModel) {
                    onDispose(viewModel::close)
                }
                ProfileRoute(
                    viewModel = viewModel,
                    onBack = { navController.popBackStack() },
                    onSignIn = { navController.navigate(AuthDestination) { launchSingleTop = true } },
                    onOpenPost = { postId -> navController.navigate(PostDestination(postId)) },
                    onOpenProfile = { username -> navController.navigate(ProfileDestination(username)) },
                    onOpenManage = { navController.navigate(ManageDestination) { launchSingleTop = true } },
                )
            }
            composable<AuthDestination> {
                val viewModel =
                    remember(instanceRepository, authRepository) {
                        AuthViewModel(instanceRepository::savedInstance, authRepository)
                    }
                DisposableEffect(viewModel) {
                    onDispose(viewModel::close)
                }
                AuthRoute(
                    viewModel = viewModel,
                    onChangeInstance = { navController.popBackStack() },
                    onContinue = { navController.popBackStack() },
                )
            }
        }
    }
}

@Serializable
private data object ConnectDestination

@Serializable
private data object TimelineDestination

@Serializable
private data object SearchDestination

@Serializable
private data object DiscoverDestination

@Serializable
private data class TagDestination(
    val slug: String,
)

@Serializable
private data class PostDestination(
    val postId: String,
)

@Serializable
private data class ComposeDestination(
    val postId: String? = null,
)

@Serializable
private data object ManageDestination

@Serializable
private data object SettingsDestination

@Serializable
private data object OfflineReadingDestination

@Serializable
private data class ProfileDestination(
    val username: String,
)

@Serializable
private data object AuthDestination
