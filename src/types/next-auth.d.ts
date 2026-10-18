import "next-auth"

declare module "next-auth" {
  interface Session {
    user: {
      id: string
      name: string
      email: string
      image?: string
      /** Discord-style decorative frame id (see DecoratedAvatar). */
      avatarDecoration?: string
    }
  }
}
