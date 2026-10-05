package org.omicron.mobile

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import org.omicron.mobile.core.storage.EncryptedSessionCookieStore
import org.omicron.mobile.core.storage.SharedPreferencesInstanceStore
import org.omicron.mobile.data.api.KtorAuthApi
import org.omicron.mobile.data.api.KtorInstanceApi
import org.omicron.mobile.data.repository.AuthRepository
import org.omicron.mobile.data.repository.InstanceRepository

class MainActivity : ComponentActivity() {
    private lateinit var appContainer: AppContainer

    override fun onCreate(savedInstanceState: Bundle?) {
        enableEdgeToEdge()
        super.onCreate(savedInstanceState)
        appContainer = AppContainer(applicationContext)
        setContent { OmicronApp(appContainer.instanceRepository, appContainer.authRepository) }
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

    val authRepository = AuthRepository(KtorAuthApi(httpClient))

    fun close() {
        httpClient.close()
    }
}
