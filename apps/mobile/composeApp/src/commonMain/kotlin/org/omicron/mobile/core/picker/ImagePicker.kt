package org.omicron.mobile.core.picker

import androidx.compose.runtime.Composable

@Composable
expect fun rememberImagePickerLauncher(onPicked: (ByteArray, String?) -> Unit): () -> Unit
