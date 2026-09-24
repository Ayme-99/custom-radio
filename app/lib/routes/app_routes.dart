import 'package:flutter/material.dart';

import '../screens/home_screen.dart';

/// Nombres de ruta centralizados. Las pantallas de login (#16) e importación
/// de canciones (#19) etc. se añadirán aquí a medida que se implementen.
class AppRoutes {
  AppRoutes._();

  static const String home = '/';

  static Map<String, WidgetBuilder> get routes => {
        home: (_) => const HomeScreen(),
      };
}
