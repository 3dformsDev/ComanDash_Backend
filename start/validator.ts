import vine, { SimpleMessagesProvider } from '@vinejs/vine'

vine.messagesProvider = new SimpleMessagesProvider({
  // Mensajes genéricos aplicables a cualquier campo
  'required': 'The {{ field }} field is required',
  'string': 'The {{ field }} must be a valid string',
  'email': 'The {{ field }} must be a valid email address',
  'minLength': 'The {{ field }} must have at least {{ min }} characters',
  'maxLength': 'The {{ field }} must not exceed {{ max }} characters',
  'confirmed': 'The {{ field }} confirmation does not match',

  // Ejemplos específicos para campos concretos (opcional)
  'username.required': 'Please choose a username for your account',
  'password.required': 'You must provide a password',
})
