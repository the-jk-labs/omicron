package org.omicron.mobile

import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.remember
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import androidx.navigation.toRoute
import kotlinx.serialization.Serializable
import org.omicron.mobile.core.designsystem.OmicronTheme
import org.omicron.mobile.data.repository.AuthRepository
import org.omicron.mobile.data.repository.InstanceRepository
import org.omicron.mobile.data.repository.PostsRepository
import org.omicron.mobile.data.repository.SocialRepository
import org.omicron.mobile.feature.auth.AuthRoute
import org.omicron.mobile.feature.auth.AuthViewModel
import org.omicron.mobile.feature.connect.ConnectRoute
import org.omicron.mobile.feature.connect.ConnectViewModel
import org.omicron.mobile.feature.reader.PostDetailRoute
import org.omicron.mobile.feature.reader.PostDetailViewModel
import org.omicron.mobile.feature.reader.PostSocialViewModel
import org.omicron.mobile.feature.reader.TimelineRoute
import org.omicron.mobile.feature.reader.TimelineViewModel
import org.omicron.mobile.feature.profile.ProfileRoute
import org.omicron.mobile.feature.profile.ProfileViewModel

@Composable
fun OmicronApp(
    instanceRepository: InstanceRepository,
    authRepository: AuthRepository,
    postsRepository: PostsRepository,
    socialRepository: SocialRepository,
) {
    OmicronTheme {
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
private data class PostDestination(
    val postId: String,
)

@Serializable
private data class ProfileDestination(
    val username: String,
)

@Serializable
private data object AuthDestination
