package org.omicron.mobile

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import coil3.ImageLoader
import coil3.SingletonImageLoader
import coil3.network.ktor3.KtorNetworkFetcherFactory
import coil3.request.crossfade
import org.omicron.mobile.core.storage.EncryptedSessionCookieStore
import org.omicron.mobile.core.storage.SharedPreferencesInstanceStore
import org.omicron.mobile.data.api.KtorAuthApi
import org.omicron.mobile.data.api.KtorInstanceApi
import org.omicron.mobile.data.api.KtorPostsApi
import org.omicron.mobile.data.api.KtorSocialApi
import org.omicron.mobile.data.repository.AuthRepository
import org.omicron.mobile.data.repository.InstanceRepository
import org.omicron.mobile.data.repository.PostsRepository
import org.omicron.mobile.data.repository.SocialRepository

class MainActivity : ComponentActivity() {
    private lateinit var appContainer: AppContainer

    override fun onCreate(savedInstanceState: Bundle?) {
        enableEdgeToEdge()
        super.onCreate(savedInstanceState)
        SingletonImageLoader.setSafe { context ->
            ImageLoader.Builder(context).components { add(KtorNetworkFetcherFactory()) }.crossfade(true).build()
        }
        appContainer = AppContainer(applicationContext)
        setContent {
            OmicronApp(
                appContainer.instanceRepository,
                appContainer.authRepository,
                appContainer.postsRepository,
                appContainer.socialRepository,
            )
        }
    }

    override fun onDestroy() {
        appContainer.close()
        super.onDestroy()
    }
}

private class AppContainer(context: android.content.Context) {
    private val sessionCookieStore = EncryptedSessionCookieStore(context)
    private val httpClient = createHttpClient(sessionCookieStore)

    val instanceRepository =
        InstanceRepository(
            api = KtorInstanceApi(httpClient),
            store = SharedPreferencesInstanceStore(context),
        )

    val authRepository = AuthRepository(api = KtorAuthApi(httpClient), sessionCookieStore = sessionCookieStore)

    val postsRepository =
        PostsRepository(
            api = KtorPostsApi(httpClient),
            savedInstance = instanceRepository::savedInstance,
            accessToken = authRepository::accessToken,
            onUnauthorized = { authRepository.invalidateSession() },
        )

    val socialRepository =
        SocialRepository(
            api = KtorSocialApi(httpClient),
            savedInstance = instanceRepository::savedInstance,
            accessToken = authRepository::accessToken,
            onUnauthorized = { authRepository.invalidateSession() },
        )

    fun close() {
        httpClient.close()
    }
}
