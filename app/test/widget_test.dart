import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:app/app.dart';

void main() {
  testWidgets('CustomRadioApp muestra la pantalla de inicio', (WidgetTester tester) async {
    await tester.pumpWidget(const CustomRadioApp());

    expect(find.text('Custom Radio'), findsWidgets);
    expect(find.byIcon(Icons.radio_rounded), findsOneWidget);
  });
}
