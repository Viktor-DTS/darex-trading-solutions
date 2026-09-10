import 'package:flutter/material.dart';

class OfflineModeBanner extends StatefulWidget {
  const OfflineModeBanner({super.key});

  @override
  State<OfflineModeBanner> createState() => _OfflineModeBannerState();
}

class _OfflineModeBannerState extends State<OfflineModeBanner>
    with SingleTickerProviderStateMixin {
  late final AnimationController _controller;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      vsync: this,
      duration: const Duration(seconds: 14),
    )..repeat();
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    const text = 'відсутній інтернет ви працюєте в автономному режимі     ';
    return Material(
      color: const Color(0xFFFFEB3B),
      child: SizedBox(
        height: 28,
        width: double.infinity,
        child: ClipRect(
          child: AnimatedBuilder(
            animation: _controller,
            builder: (context, _) {
              return Align(
                alignment: Alignment.centerLeft,
                child: Transform.translate(
                  offset: Offset(
                    MediaQuery.sizeOf(context).width * (1 - _controller.value * 2),
                    0,
                  ),
                  child: const Text(
                    '$text$text$text',
                    maxLines: 1,
                    softWrap: false,
                    style: TextStyle(
                      color: Colors.black,
                      fontWeight: FontWeight.w700,
                      fontSize: 13,
                    ),
                  ),
                ),
              );
            },
          ),
        ),
      ),
    );
  }
}
