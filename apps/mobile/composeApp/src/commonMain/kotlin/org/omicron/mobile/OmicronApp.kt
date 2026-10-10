package org.omicron.mobile

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.navigation.NavBackStackEntry
import androidx.navigation.toRoute
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import kotlinx.coroutines.delay
import kotlinx.serialization.Serializable
import kotlinx.serialization.serializer
import org.jetbrains.compose.resources.stringResource
import org.omicron.mobile.core.designsystem.OmicronTheme
import org.omicron.mobile.core.designsystem.rikkaui.text.Text
import org.omicron.mobile.core.designsystem.rikkaui.text.TextVariant
import org.omicron.mobile.core.storage.AppearancePreferenceStore
import org.omicron.mobile.data.repository.AuthoringRepository
import org.omicron.mobile.data.repository.AuthRepository
import org.omicron.mobile.data.repository.DiscoveryRepository
import org.omicron.mobile.data.repository.InstanceRepository
import org.omicron.mobile.data.repository.MobileWebRepository
import org.omicron.mobile.data.repository.PostsRepository
import org.omicron.mobile.data.repository.SocialRepository
import org.omicron.mobile.feature.auth.AuthRoute
import org.omicron.mobile.feature.auth.AuthViewModel
import org.omicron.mobile.feature.composer.ComposerRoute
import org.omicron.mobile.feature.composer.ComposerViewModel
import org.omicron.mobile.feature.connect.ConnectRoute
import org.omicron.mobile.feature.connect.ConnectViewModel
import org.omicron.mobile.feature.dashboard.DashboardRoute
import org.omicron.mobile.feature.dashboard.DashboardViewModel
import org.omicron.mobile.feature.discovery.DiscoverRoute
import org.omicron.mobile.feature.discovery.DiscoverViewModel
import org.omicron.mobile.feature.discovery.SearchRoute
import org.omicron.mobile.feature.discovery.SearchViewModel
import org.omicron.mobile.feature.discovery.TagRoute
import org.omicron.mobile.feature.discovery.TagViewModel
import org.omicron.mobile.feature.manage.ManageRoute
import org.omicron.mobile.feature.manage.ManageViewModel
import org.omicron.mobile.feature.lists.ListDetailRoute
import org.omicron.mobile.feature.lists.ListDetailViewModel
import org.omicron.mobile.feature.lists.ListsRoute
import org.omicron.mobile.feature.lists.ListsViewModel
import org.omicron.mobile.feature.navigation.AccountAction
import org.omicron.mobile.feature.navigation.MobileBottomBar
import org.omicron.mobile.feature.navigation.MobileTopBar
import org.omicron.mobile.feature.navigation.PrimaryTab
import org.omicron.mobile.feature.navigation.navigateTopLevel
import org.omicron.mobile.feature.offline.OfflineReadingRoute
import org.omicron.mobile.feature.offline.OfflineReadingViewModel
import org.omicron.mobile.feature.notifications.NotificationsRoute
import org.omicron.mobile.feature.notifications.NotificationsViewModel
import org.omicron.mobile.feature.reader.PostDetailRoute
import org.omicron.mobile.feature.reader.PostDetailViewModel
import org.omicron.mobile.feature.reader.PostSocialViewModel
import org.omicron.mobile.feature.reader.TimelineRoute
import org.omicron.mobile.feature.reader.TimelineViewModel
import org.omicron.mobile.feature.profile.ProfileRoute
import org.omicron.mobile.feature.profile.ProfileViewModel
import org.omicron.mobile.feature.settings.SettingsRoute
import org.omicron.mobile.feature.settings.SettingsViewModel
import org.omicron.mobile.resources.Res
import org.omicron.mobile.resources.settings_sign_out_warning

@Composable
fun OmicronApp(
    instanceRepository: InstanceRepository,
    authRepository: AuthRepository,
    postsRepository: PostsRepository,
    socialRepository: SocialRepository,
    discoveryRepository: DiscoveryRepository,
    authoringRepository: AuthoringRepository,
    mobileWebRepository: MobileWebRepository,
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
    val session by authRepository.session.collectAsState()
    val notificationsViewModel = remember(mobileWebRepository) { NotificationsViewModel(mobileWebRepository) }
    DisposableEffect(notificationsViewModel) {
        onDispose(notificationsViewModel::close)
    }
    val notificationsState by notificationsViewModel.uiState.collectAsState()
    LaunchedEffect(session?.user?.id) {
        if (session == null) {
            notificationsViewModel.clearForSignOut()
        } else {
            notificationsViewModel.refreshUnreadCount()
            while (true) {
                delay(60_000)
                notificationsViewModel.refreshUnreadCount()
            }
        }
    }
    OmicronTheme(
        appearance = settingsState.appearance,
        onDarkThemeChanged = onDarkThemeChanged,
    ) {
        val navController = rememberNavController()
        val backStackEntry by navController.currentBackStackEntryAsState()
        val standalone =
            backStackEntry == null || backStackEntry.routeMatches<ConnectDestination>() || backStackEntry.routeMatches<AuthDestination>()
        val selectedTab =
            when {
                backStackEntry.routeMatches<TimelineDestination>() -> PrimaryTab.Home
                backStackEntry.routeMatches<ListsDestination>() -> PrimaryTab.Lists
                backStackEntry.routeMatches<ComposeDestination>() -> PrimaryTab.Write
                backStackEntry.routeMatches<DashboardDestination>() -> PrimaryTab.Stats
                backStackEntry.routeMatches<ProfileDestination>() &&
                    backStackEntry?.toRoute<ProfileDestination>()?.username == session?.user?.username -> PrimaryTab.Profile
                else -> null
            }
        val requiresSession =
            backStackEntry.routeMatches<ListsDestination>() ||
                backStackEntry.routeMatches<ListDestination>() ||
                backStackEntry.routeMatches<DashboardDestination>() ||
                backStackEntry.routeMatches<NotificationsDestination>()
        LaunchedEffect(session?.user?.id, requiresSession) {
            if (session == null && requiresSession) {
                navController.navigate(TimelineDestination) {
                    popUpTo<TimelineDestination> { inclusive = false }
                    launchSingleTop = true
                }
            }
        }
        Column(
            modifier = Modifier.fillMaxSize().background(OmicronTheme.colors.background).safeDrawingPadding(),
        ) {
            if (!standalone) {
                MobileTopBar(
                    appName = settingsState.instance?.name.orEmpty(),
                    user = session?.user,
                    unreadCount = notificationsState.unreadCount,
                    onSearch = { navController.navigate(SearchDestination) { launchSingleTop = true } },
                    onNotifications = { navController.navigate(NotificationsDestination) { launchSingleTop = true } },
                    notifications = notificationsState.items,
                    notificationsLoading = notificationsState.isLoading,
                    onRefreshNotifications = notificationsViewModel::refresh,
                    onOpenNotification = { notification ->
                        when {
                            notification.type == "follow" || notification.type == "follow_accepted" || notification.type == "follow_request" ->
                                notification.actor?.username?.let { navController.navigate(ProfileDestination(it)) }
                            notification.postId != null -> navController.navigate(PostDestination(notification.postId))
                        }
                    },
                    onAccountAction = { action ->
                        when (action) {
                            AccountAction.Profile -> session?.user?.username?.let { navController.navigateTopLevel(ProfileDestination(it), TimelineDestination) }
                            AccountAction.Lists -> navController.navigateTopLevel(ListsDestination, TimelineDestination)
                            AccountAction.Write -> navController.navigateTopLevel(ComposeDestination(), TimelineDestination)
                            AccountAction.Stats -> navController.navigateTopLevel(DashboardDestination, TimelineDestination)
                            AccountAction.YourPosts -> navController.navigateTopLevel(ManageDestination, TimelineDestination)
                            AccountAction.Settings -> navController.navigate(SettingsDestination) { launchSingleTop = true }
                            AccountAction.SignIn, AccountAction.Register -> navController.navigate(AuthDestination) { launchSingleTop = true }
                            AccountAction.SignOut -> {
                                settingsViewModel.signOut()
                                navController.navigate(TimelineDestination) {
                                    popUpTo<TimelineDestination> { inclusive = false }
                                    launchSingleTop = true
                                }
                            }
                        }
                    },
                )
            }
            if (settingsState.signOutWarning && !standalone) {
                Text(
                    text = stringResource(Res.string.settings_sign_out_warning),
                    variant = TextVariant.Small,
                    color = OmicronTheme.colors.destructive,
                    modifier = Modifier.fillMaxWidth().background(OmicronTheme.colors.muted).padding(horizontal = 16.dp, vertical = 8.dp),
                )
            }
            Box(modifier = Modifier.weight(1f).fillMaxSize()) {
                NavHost(
                    navController = navController,
                    startDestination = ConnectDestination,
                    modifier = Modifier.fillMaxSize(),
                ) {
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
                                TimelineViewModel(
                                    postsRepository,
                                    session = authRepository.session,
                                    sessionExpired = authRepository.sessionExpired,
                                    socialRepository = socialRepository,
                                )
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
                            onOpenTag = { slug -> navController.navigate(TagDestination(slug)) },
                        )
                    }
                    composable<ListsDestination> {
                        val viewModel = remember(mobileWebRepository) { ListsViewModel(mobileWebRepository) }
                        DisposableEffect(viewModel) { onDispose(viewModel::close) }
                        ListsRoute(viewModel = viewModel, onOpenList = { id -> navController.navigate(ListDestination(id)) })
                    }
                    composable<ListDestination> { backStackEntry ->
                        val listId = backStackEntry.toRoute<ListDestination>().listId
                        val viewModel = remember(listId, mobileWebRepository) { ListDetailViewModel(listId, mobileWebRepository) }
                        DisposableEffect(viewModel) { onDispose(viewModel::close) }
                        ListDetailRoute(viewModel = viewModel, onOpenPost = { postId -> navController.navigate(PostDestination(postId)) })
                    }
                    composable<DashboardDestination> {
                        val viewModel = remember(mobileWebRepository) { DashboardViewModel(mobileWebRepository) }
                        DisposableEffect(viewModel) { onDispose(viewModel::close) }
                        DashboardRoute(viewModel = viewModel, onOpenPost = { postId -> navController.navigate(PostDestination(postId)) })
                    }
                    composable<NotificationsDestination> {
                        NotificationsRoute(
                            viewModel = notificationsViewModel,
                            onOpenPost = { postId -> navController.navigate(PostDestination(postId)) },
                            onOpenProfile = { username -> navController.navigate(ProfileDestination(username)) },
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
            if (session != null && !standalone) {
                MobileBottomBar(selected = selectedTab) { tab ->
                    when (tab) {
                        PrimaryTab.Home -> navController.navigateTopLevel(TimelineDestination, TimelineDestination)
                        PrimaryTab.Lists -> navController.navigateTopLevel(ListsDestination, TimelineDestination)
                        PrimaryTab.Write -> navController.navigateTopLevel(ComposeDestination(), TimelineDestination)
                        PrimaryTab.Stats -> navController.navigateTopLevel(DashboardDestination, TimelineDestination)
                        PrimaryTab.Profile -> session?.user?.username?.let { navController.navigateTopLevel(ProfileDestination(it), TimelineDestination) }
                    }
                }
            }
        }
    }
}

private inline fun <reified T : Any> NavBackStackEntry?.routeMatches(): Boolean =
    this?.destination?.route?.let { route ->
        val routeName = serializer<T>().descriptor.serialName
        route == routeName || route.startsWith("$routeName/")
    } ?: false

@Serializable
private data object ConnectDestination

@Serializable
private data object TimelineDestination

@Serializable
private data object ListsDestination

@Serializable
private data class ListDestination(
    val listId: String,
)

@Serializable
private data object DashboardDestination

@Serializable
private data object NotificationsDestination

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
